pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.scale = 1.5;
        this.pages = [];

        this.prevBtn = document.getElementById('prev-page');
        this.nextBtn = document.getElementById('next-page');
        this.pageNumInput = document.getElementById('page-num');
        this.pageTotalSpan = document.getElementById('page-total');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomSelect = document.getElementById('zoom-select');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.errorMsg = document.getElementById('error-message');
        this.sidebar = document.getElementById('sidebar');
        this.printBtn = document.getElementById('print-btn');
        this.printContainer = document.getElementById('print-container');
        this.viewerContainer = document.getElementById('viewer-container');
        this.currentUrl = null;
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.thumbnailList = document.getElementById('thumbnail-list');
        this.viewModeToggleBtn = document.getElementById('view-mode-toggle');

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.isBookMode = false;
        this.isDocxMode = false;
        this.isZooming = false;

        this.lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.page);
                    this.renderVisiblePage(pageNum);
                }
            });
        }, {
            rootMargin: '500px 0px',
            threshold: 0.1
        });

        this.pageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.page);
                    this.updateToolbarPagination(pageNum);
                }
            });
        }, {
            root: this.viewerContainer,
            rootMargin: "-40% 0px -40% 0px"
        });

        this.init();
    }

    async init() {
        this.setupEventListeners();
        const search = window.location.search;
        let fileUrl = null;

        const fileMatch = search.match(/[?&](?:file|url)=(.+)/);
        if (fileMatch) {
            let extracted = fileMatch[1];
            if (extracted.startsWith('http%3A') || extracted.startsWith('https%3A')) {
                fileUrl = decodeURIComponent(extracted);
            } else {
                fileUrl = extracted;
            }
        }

        if (!fileUrl) {
            fileUrl = 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
        }
        this.currentUrl = fileUrl;

        const urlWithoutQuery = fileUrl.split('?')[0].toLowerCase();
        if (urlWithoutQuery.endsWith('.docx')) {
            this.isDocxMode = true;
            await this.loadDocx(fileUrl);
            return;
        }

        const onSuccess = () => {
            this.autoScale('page-height');
            this.renderThumbnails();
        };
        try {
            await this.loadDocument(fileUrl);
            onSuccess();
        } catch (e) {
            try {
                const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`;
                await this.loadDocument(proxy);
                onSuccess();
            } catch (e2) {
                console.error('Error loading PDF:', e2);
                this.showError();
            }
        }
    }

    setupEventListeners() {
        this.prevBtn.addEventListener('click', () => this.scrollToPage(this.pageNum - 1));
        this.nextBtn.addEventListener('click', () => this.scrollToPage(this.pageNum + 1));
        this.sidebarToggle.addEventListener('click', () => {
            this.sidebar.classList.toggle('hidden');
        });
        this.pageNumInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (this.pdfDoc && val > 0 && val <= this.pdfDoc.numPages) {
                this.scrollToPage(val);
            }
        });
        this.zoomInBtn.addEventListener('click', () => this.changeScale(0.25));
        this.zoomOutBtn.addEventListener('click', () => this.changeScale(-0.25));
        this.zoomSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'page-fit' || val === 'page-height' || val === 'page-width') {
                this.autoScale(val);
            } else {
                this.scale = parseFloat(val);
                if (this.isDocxMode) {
                    this.applyDocxZoom();
                } else {
                    this.reRenderAllPages();
                }
            }
        });
        if (this.viewModeToggleBtn) {
            this.viewModeToggleBtn.addEventListener('click', () => {
                this.isBookMode = !this.isBookMode;
                this.updateViewMode();
            });
        }
        if (this.printBtn) {
            this.printBtn.addEventListener('click', () => this.printDocument());
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown') this.scrollToPage(this.pageNum + 1);
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.scrollToPage(this.pageNum - 1);
        });

        this.viewerContainer.style.cursor = 'grab';

        this.viewerContainer.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.viewerContainer.style.cursor = 'grabbing';
            this.startX = e.pageX - this.viewerContainer.offsetLeft;
            this.startY = e.pageY - this.viewerContainer.offsetTop;
            this.scrollLeft = this.viewerContainer.scrollLeft;
            this.scrollTop = this.viewerContainer.scrollTop;
        });

        this.viewerContainer.addEventListener('mouseleave', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.viewerContainer.style.cursor = 'grab';
        });

        this.viewerContainer.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.viewerContainer.style.cursor = 'grab';
        });

        this.viewerContainer.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            const x = e.pageX - this.viewerContainer.offsetLeft;
            const y = e.pageY - this.viewerContainer.offsetTop;
            const walkX = (x - this.startX) * 1.5;
            const walkY = (y - this.startY) * 1.5;
            this.viewerContainer.scrollLeft = this.scrollLeft - walkX;
            this.viewerContainer.scrollTop = this.scrollTop - walkY;
        });
    }

    async loadDocument(url) {
        this.showLoading(true);
        this.errorMsg.classList.add('hidden');
        try {
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.pageTotalSpan.textContent = this.pdfDoc.numPages;
            this.createPagePlaceholders();
            this.showLoading(false);
        } catch (err) {
            this.showLoading(false);
            throw err;
        }
    }

    async loadDocx(url) {
        this.showLoading(true);
        this.errorMsg.classList.add('hidden');

        const renderDocx = async (fetchUrl) => {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const arrayBuffer = await response.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });

            this.viewerContainer.className = 'flex-1 overflow-auto p-4 md:p-10 bg-transparent scrollbar-custom';
            this.viewerContainer.innerHTML = `<div class="docx-content" style="transition: zoom 0.2s ease;">${result.value}</div>`;

            const sidebarToggle = document.getElementById('sidebar-toggle');
            if (sidebarToggle) sidebarToggle.style.visibility = 'hidden';
            const prevPage = document.getElementById('prev-page');
            if (prevPage) prevPage.style.visibility = 'hidden';
            const nextPage = document.getElementById('next-page');
            if (nextPage) nextPage.style.visibility = 'hidden';
            const pageNum = document.getElementById('page-num');
            if (pageNum && pageNum.parentElement) pageNum.parentElement.style.visibility = 'hidden';
            const viewModeToggle = document.getElementById('view-mode-toggle');
            if (viewModeToggle) viewModeToggle.style.visibility = 'hidden';

            if (this.sidebar) this.sidebar.classList.add('hidden');

            this.showLoading(false);
        };

        try {
            await renderDocx(url);
        } catch (err) {
            console.error('Error loading DOCX:', err);
            try {
                const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                await renderDocx(proxy);
            } catch (e2) {
                console.error('Error loading DOCX with proxy:', e2);
                this.showError();
            }
        }
    }

    async createPagePlaceholders() {
        const firstPage = await this.pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: this.scale });
        const aspectRatio = viewport.width / viewport.height;
        const loadingSpinner = document.getElementById('loading-spinner');
        const errorMsg = document.getElementById('error-message');
        this.viewerContainer.innerHTML = '';
        this.viewerContainer.appendChild(loadingSpinner);
        this.viewerContainer.appendChild(errorMsg);
        this.pages = [];

        if (this.isBookMode) {
            this.viewerContainer.className = 'flex-1 overflow-auto relative p-4 md:p-10 grid justify-items-center items-start gap-y-4 md:gap-y-8 gap-x-0 bg-transparent scrollbar-custom';
            this.viewerContainer.style.gridTemplateColumns = 'max-content max-content';
            this.viewerContainer.style.alignItems = '';
            this.viewerContainer.style.justifyContent = 'safe center';
        } else {
            this.viewerContainer.className = 'flex-1 overflow-auto relative p-4 md:p-10 flex flex-col gap-4 md:gap-8 bg-transparent scrollbar-custom';
            this.viewerContainer.style.gridTemplateColumns = '';
            this.viewerContainer.style.justifyContent = '';
            this.viewerContainer.style.alignItems = 'safe center';
        }

        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            const container = document.createElement('div');
            container.id = `page-container-${i}`;

            container.className = 'page-wrapper flex justify-center';

            container.dataset.page = i;
            container.style.aspectRatio = `${aspectRatio}`;
            this.viewerContainer.appendChild(container);
            const pageData = {
                num: i,
                container: container,
                rendered: false,
                rendering: false
            };
            this.pages.push(pageData);
            this.lazyObserver.observe(container);
            this.pageObserver.observe(container);
        }
    }

    async renderVisiblePage(pageNum) {
        const pageData = this.pages[pageNum - 1];
        if (!pageData || pageData.rendered || pageData.rendering) return;
        pageData.rendering = true;
        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            const canvas = document.createElement('canvas');
            canvas.className = 'shadow-premium bg-white transition-opacity duration-500 opacity-0';
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            pageData.container.innerHTML = '';
            pageData.container.appendChild(canvas);
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            pageData.rendered = true;
            pageData.rendering = false;
            setTimeout(() => canvas.classList.remove('opacity-0'), 10);
        } catch (err) {
            console.error(`Error renderizando página ${pageNum}:`, err);
            pageData.rendering = false;
        }
    }

    updateToolbarPagination(num) {
        this.pageNum = num;
        this.pageNumInput.value = num;
        this.updateActiveThumbnail(num);
    }

    scrollToPage(num, instant = false) {
        if (!this.pdfDoc || num < 1 || num > this.pdfDoc.numPages) return;
        const target = document.getElementById(`page-container-${num}`);
        if (target) {
            const isFitMode = this.zoomSelect.value === 'page-fit' || this.zoomSelect.value === 'page-height';
            const scrollBlock = isFitMode ? 'center' : 'start';
            
            if (instant) {
                target.scrollIntoView({ behavior: 'auto', block: scrollBlock });
            } else {
                target.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
            }
            this.updateToolbarPagination(num);
        }
    }

    async renderThumbnails() {
        if (!this.pdfDoc) return;
        this.thumbnailList.innerHTML = '';
        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            const page = await this.pdfDoc.getPage(i);
            const item = document.createElement('div');
            item.className = `thumbnail-item group cursor-pointer flex flex-col items-center gap-2 transition-all hover:scale-105 ${i === this.pageNum ? 'active' : ''}`;
            item.dataset.page = i;
            const canvas = document.createElement('canvas');
            canvas.className = 'w-[100px] h-auto bg-white border-2 border-transparent rounded-lg shadow-sm group-hover:shadow-md transition-all';
            const label = document.createElement('span');
            label.className = `text-xs tracking-wider ${i === this.pageNum ? 'text-primary' : 'text-[#f5f5f5]'}`;
            label.textContent = `${i}`;
            item.appendChild(canvas);
            item.appendChild(label);
            this.thumbnailList.appendChild(item);
            const viewport = page.getViewport({ scale: 0.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            }).promise;
            item.addEventListener('click', () => this.scrollToPage(i));
        }
    }

    updateActiveThumbnail(num) {
        const items = this.thumbnailList.querySelectorAll('.thumbnail-item');

        items.forEach(item => {
            const canvas = item.querySelector('canvas');
            const label = item.querySelector('span');
            const isPage = parseInt(item.dataset.page) === num;

            if (isPage) {
                item.classList.add('active');

                canvas.classList.add('border-primary', 'ring-2', 'ring-primary/20');

                label.classList.remove('text-[#f5f5f5]', 'opacity-60');
                label.classList.add('text-primary', 'font-bold');

                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            } else {
                item.classList.remove('active');

                canvas.classList.remove('border-primary', 'ring-2', 'ring-primary/20');
                label.classList.remove('text-primary');
                label.classList.add('text-[#f5f5f5]', 'font-light', 'opacity-60');
            }
        });
    }
    updateViewMode() {
        if (this.isBookMode) {
            this.viewerContainer.className = 'flex-1 overflow-auto relative p-4 md:p-10 grid justify-items-center items-start gap-y-4 md:gap-y-8 gap-x-0 bg-transparent scrollbar-custom';
            this.viewerContainer.style.gridTemplateColumns = 'max-content max-content';
            this.viewerContainer.style.alignItems = '';
            this.viewerContainer.style.justifyContent = 'safe center';
            this.viewModeToggleBtn.classList.add('text-[#0A77F3]', 'border-[#0A77F3]');
        } else {
            this.viewerContainer.className = 'flex-1 overflow-auto relative p-4 md:p-10 flex flex-col gap-4 md:gap-8 bg-transparent scrollbar-custom';
            this.viewerContainer.style.gridTemplateColumns = '';
            this.viewerContainer.style.justifyContent = '';
            this.viewerContainer.style.alignItems = 'safe center';
            this.viewModeToggleBtn.classList.remove('text-[#0A77F3]', 'border-[#0A77F3]');
        }

        this.pages.forEach(p => {
            p.container.className = 'page-wrapper flex justify-center';
        });

        if (this.zoomSelect.value === 'page-fit' || this.zoomSelect.value === 'page-width') {
            this.autoScale(this.zoomSelect.value);
        } else {
            this.reRenderAllPages();
        }
    }

    changeScale(delta) {
        this.scale = Math.max(0.25, Math.min(5.0, this.scale + delta));
        this.updateZoomUI();
        if (this.isDocxMode) {
            this.applyDocxZoom();
        } else {
            this.reRenderAllPages();
        }
    }

    updateZoomUI() {
        let optionExists = Array.from(this.zoomSelect.options).some(opt => opt.value == this.scale);
        let customOpt = document.getElementById('custom-zoom-opt');

        if (!optionExists) {
            if (!customOpt) {
                customOpt = document.createElement('option');
                customOpt.id = 'custom-zoom-opt';
                customOpt.hidden = true;
                this.zoomSelect.appendChild(customOpt);
            }
            customOpt.value = this.scale;
            customOpt.textContent = `${Math.round(this.scale * 100)}%`;
        }

        this.zoomSelect.value = this.scale;
    }

    applyDocxZoom() {
        const content = this.viewerContainer.querySelector('.docx-content');
        if (content) {
            content.style.zoom = this.scale;
        }
    }

    autoScale(mode) {
        // paddingX adjusts for the horizontal padding of the container (p-10 = 40px each side) + small margin
        const paddingX = 90;

        // paddingY = 48px to leave a clean 24px margin top and bottom when centered
        const paddingY = 48;

        let availableWidth = this.viewerContainer.clientWidth - paddingX;

        if (this.isBookMode) {
            availableWidth = (this.viewerContainer.clientWidth / 2) - (paddingX / 2);
        }

        if (this.isDocxMode) {
            this.scale = 1.0;
            this.updateZoomUI();
            this.applyDocxZoom();
            return;
        }

        const availableHeight = this.viewerContainer.clientHeight - paddingY;

        this.pdfDoc.getPage(this.pageNum).then(page => {
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            if (mode === 'page-width') {
                this.scale = availableWidth / unscaledViewport.width;
            } else if (mode === 'page-fit' || mode === 'page-height') {
                const scaleW = availableWidth / unscaledViewport.width;
                const scaleH = availableHeight / unscaledViewport.height;
                this.scale = Math.min(scaleW, scaleH);
            }
            this.reRenderAllPages();
        });
    }

    async reRenderAllPages() {
        if (!this.pdfDoc) return;
        
        // Desconectar el observador para vaciar la cola de eventos sucios generados por el reacomodo
        this.pageObserver.disconnect();

        const targetPage = this.pageNum;
        const targetContainer = document.getElementById(`page-container-${targetPage}`);
        
        let ratioY = 0;
        let ratioX = 0;
        let isFitMode = this.zoomSelect.value === 'page-fit' || this.zoomSelect.value === 'page-height';

        if (!isFitMode && targetContainer) {
            // Posición exacta del centro de la pantalla calculada sobre el contenido scrolleable
            const viewerCenterY = this.viewerContainer.scrollTop + (this.viewerContainer.clientHeight / 2);
            const viewerCenterX = this.viewerContainer.scrollLeft + (this.viewerContainer.clientWidth / 2);

            const offsetY = viewerCenterY - targetContainer.offsetTop;
            const offsetX = viewerCenterX - targetContainer.offsetLeft;
            
            ratioY = targetContainer.offsetHeight > 0 ? offsetY / targetContainer.offsetHeight : 0.5;
            ratioX = targetContainer.offsetWidth > 0 ? offsetX / targetContainer.offsetWidth : 0.5;
        }

        const firstPage = await this.pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: this.scale });
        const aspectRatio = viewport.width / viewport.height;

        this.pages.forEach(p => {
            p.rendered = false;
            p.rendering = false;
            p.container.innerHTML = '';
            p.container.style.width = `${viewport.width}px`;
            p.container.style.height = `${viewport.height}px`;
            p.container.style.aspectRatio = `${aspectRatio}`;
            this.lazyObserver.unobserve(p.container);
            this.lazyObserver.observe(p.container);
        });

        requestAnimationFrame(() => {
            const target = document.getElementById(`page-container-${targetPage}`);
            if (!target) {
                setTimeout(() => {
                    this.pages.forEach(p => this.pageObserver.observe(p.container));
                }, 100);
                return;
            }

            const targetTop = target.offsetTop;
            const targetLeft = target.offsetLeft;
            const targetHeight = target.offsetHeight;
            const targetWidth = target.offsetWidth;

            if (isFitMode) {
                // Cálculo puro basado en el contenedor scrolleable absoluto (offsetParent)
                const targetCenterY = targetTop + (targetHeight / 2);
                const desiredScrollTop = targetCenterY - (this.viewerContainer.clientHeight / 2);
                this.viewerContainer.scrollTop = desiredScrollTop;
                
                const targetCenterX = targetLeft + (targetWidth / 2);
                const desiredScrollLeft = targetCenterX - (this.viewerContainer.clientWidth / 2);
                this.viewerContainer.scrollLeft = desiredScrollLeft;
            } else {
                const pointY = targetTop + (targetHeight * ratioY);
                const desiredScrollTop = pointY - (this.viewerContainer.clientHeight / 2);
                this.viewerContainer.scrollTop = desiredScrollTop;

                const pointX = targetLeft + (targetWidth * ratioX);
                const desiredScrollLeft = pointX - (this.viewerContainer.clientWidth / 2);
                this.viewerContainer.scrollLeft = desiredScrollLeft;
            }
            
            setTimeout(() => {
                this.pages.forEach(p => this.pageObserver.observe(p.container));
            }, 100);
        });
    }

    async printDocument() {
        if (this.isDocxMode) {
            this.printContainer.innerHTML = this.viewerContainer.innerHTML;
            window.print();
            this.printContainer.innerHTML = '';
            return;
        }
        if (!this.pdfDoc) return;
        this.showLoading(true);
        this.printContainer.innerHTML = '';
        try {
            const pages = Array.from({ length: this.pdfDoc.numPages }, (_, i) => i + 1);
            const renderPromises = pages.map(async (num) => {
                const page = await this.pdfDoc.getPage(num);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;
                return canvas;
            });
            const renderedCanvases = await Promise.all(renderPromises);
            renderedCanvases.forEach(canvas => this.printContainer.appendChild(canvas));
            this.showLoading(false);
            window.print();
        } catch (err) {
            console.error('Print error:', err);
            this.showLoading(false);
        } finally {
            this.printContainer.innerHTML = '';
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingSpinner.classList.remove('hidden');
        } else {
            this.loadingSpinner.classList.add('hidden');
        }
    }

    showError() {
        this.loadingSpinner.classList.add('hidden');
        this.errorMsg.classList.remove('hidden');
        this.docTitle.textContent = 'Error';
    }
}

new PDFViewer();
