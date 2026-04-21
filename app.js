pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.scale = 1.0;
        this.pages = [];

        this.prevBtn = document.getElementById('prev-page');
        this.nextBtn = document.getElementById('next-page');
        this.pageNumInput = document.getElementById('page-num');
        this.pageTotalSpan = document.getElementById('page-total');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomSelect = document.getElementById('zoom-select');
        this.docTitle = document.getElementById('doc-title');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.errorMsg = document.getElementById('error-message');
        this.sidebar = document.getElementById('sidebar');
        this.printBtn = document.getElementById('print-btn');
        this.printContainer = document.getElementById('print-container');
        this.viewerContainer = document.getElementById('viewer-container');
        this.currentUrl = null;
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.thumbnailList = document.getElementById('thumbnail-list');

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
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    const pageNum = parseInt(entry.target.dataset.page);
                    this.updateToolbarPagination(pageNum);
                }
            });
        }, {
            threshold: 0.5
        });

        this.init();
    }

    async init() {
        this.setupEventListeners();
        const urlParams = new URLSearchParams(window.location.search);
        let pdfUrl = urlParams.get('file') || urlParams.get('url');
        if (!pdfUrl) {
            pdfUrl = 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
        }
        this.currentUrl = pdfUrl;
        try {
            await this.loadDocument(pdfUrl);
            const fileName = pdfUrl.split('/').pop().split('?')[0];
            this.docTitle.textContent = decodeURIComponent(fileName) || 'Documento';
            this.renderThumbnails();
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError();
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
            if (val === 'page-fit' || val === 'page-width') {
                this.autoScale(val);
            } else {
                this.scale = parseFloat(val);
                this.reRenderAllPages();
            }
        });
        if (this.printBtn) {
            this.printBtn.addEventListener('click', () => this.printDocument());
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown') this.scrollToPage(this.pageNum + 1);
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.scrollToPage(this.pageNum - 1);
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
        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            const container = document.createElement('div');
            container.id = `page-container-${i}`;
            container.className = 'page-wrapper mb-8 py-4 flex justify-center w-full min-h-[500px] transition-all';
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

    scrollToPage(num) {
        if (!this.pdfDoc || num < 1 || num > this.pdfDoc.numPages) return;
        const target = document.getElementById(`page-container-${num}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
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
            canvas.className = 'w-full h-auto bg-white border-2 border-transparent rounded-lg shadow-sm group-hover:shadow-md transition-all';
            const label = document.createElement('span');
            label.className = `text-xs font-medium tracking-wider ${i === this.pageNum ? 'text-primary' : 'text-[#f5f5f5] opacity-60'}`;
            label.textContent = `Page ${i}`;
            item.appendChild(canvas);
            item.appendChild(label);
            this.thumbnailList.appendChild(item);
            const viewport = page.getViewport({ scale: 0.3 });
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
                label.classList.add('text-primary');
                label.classList.remove('opacity-60');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('active');
                canvas.classList.remove('border-primary', 'ring-2', 'ring-primary/20');
                label.classList.remove('text-primary');
                label.classList.add('opacity-60');
            }
        });
    }

    changeScale(delta) {
        this.scale = Math.max(0.25, Math.min(5.0, this.scale + delta));
        this.zoomSelect.value = this.scale;
        this.reRenderAllPages();
    }

    autoScale(mode) {
        const padding = 80;
        const availableWidth = this.viewerContainer.clientWidth - (padding * 2);
        const availableHeight = this.viewerContainer.clientHeight - (padding * 2);
        this.pdfDoc.getPage(this.pageNum).then(page => {
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            if (mode === 'page-width') {
                this.scale = availableWidth / unscaledViewport.width;
            } else if (mode === 'page-fit') {
                const scaleW = availableWidth / unscaledViewport.width;
                const scaleH = availableHeight / unscaledViewport.height;
                this.scale = Math.min(scaleW, scaleH);
            }
            this.reRenderAllPages();
        });
    }

    async reRenderAllPages() {
        if (!this.pdfDoc) return;
        const firstPage = await this.pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: this.scale });
        const aspectRatio = viewport.width / viewport.height;
        this.pages.forEach(p => {
            p.rendered = false;
            p.rendering = false;
            p.container.innerHTML = '';
            p.container.style.aspectRatio = `${aspectRatio}`;
            p.container.style.minHeight = `${viewport.height}px`;
            this.lazyObserver.unobserve(p.container);
            this.lazyObserver.observe(p.container);
        });
    }

    async printDocument() {
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
