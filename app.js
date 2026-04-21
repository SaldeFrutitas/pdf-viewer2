// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

/**
 * PDF Viewer Application - Tailwind Edition
 */
class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.0;
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');

        // UI Elements
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
        this.currentUrl = null;


        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.thumbnailList = document.getElementById('thumbnail-list');

        this.init();
    }

    async init() {
        this.setupEventListeners();

        // Get URL from query parameter
        const urlParams = new URLSearchParams(window.location.search);
        let pdfUrl = urlParams.get('file') || urlParams.get('url');

        // Default PDF for demo
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
        this.prevBtn.addEventListener('click', () => this.onPrevPage());
        this.nextBtn.addEventListener('click', () => this.onNextPage());

        this.sidebarToggle.addEventListener('click', () => {
            this.sidebar.classList.toggle('hidden');
        });

        this.pageNumInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (this.pdfDoc && val > 0 && val <= this.pdfDoc.numPages) {
                this.queueRenderPage(val);
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
                this.renderPage(this.pageNum);
            }
        });

        if (this.printBtn) {
            this.printBtn.addEventListener('click', () => this.printDocument());
        }




        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown') this.onNextPage();
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.onPrevPage();
        });
    }

    async loadDocument(url) {
        this.showLoading(true);
        this.errorMsg.classList.add('hidden');

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.pageTotalSpan.textContent = this.pdfDoc.numPages;
            await this.renderPage(this.pageNum);
            this.showLoading(false);
        } catch (err) {
            this.showLoading(false);
            throw err;
        }
    }

    async renderPage(num) {
        if (!this.pdfDoc) return;
        this.pageRendering = true;
        this.pageNum = num;
        this.pageNumInput.value = num;

        this.updateActiveThumbnail(num);

        const page = await this.pdfDoc.getPage(num);
        let viewport = page.getViewport({ scale: this.scale });

        this.canvas.height = viewport.height;
        this.canvas.width = viewport.width;

        const renderContext = {
            canvasContext: this.ctx,
            viewport: viewport
        };

        const renderTask = page.render(renderContext);

        try {
            await renderTask.promise;
            this.pageRendering = false;
            if (this.pageNumPending !== null) {
                this.renderPage(this.pageNumPending);
                this.pageNumPending = null;
            }
        } catch (err) {
            console.error('Render error:', err);
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
            if (i === this.pageNum) canvas.classList.add('border-primary', 'ring-2', 'ring-primary/20');

            const label = document.createElement('span');
            label.className = `text-[10px] font-bold uppercase tracking-wider ${i === this.pageNum ? 'text-primary' : 'text-slate-400 opacity-60'}`;
            label.textContent = `Pág ${i}`;

            item.appendChild(canvas);
            item.appendChild(label);
            this.thumbnailList.appendChild(item);

            const viewport = page.getViewport({ scale: 0.4 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };

            await page.render(renderContext).promise;

            item.addEventListener('click', () => this.queueRenderPage(i));
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
                label.classList.remove('text-slate-400', 'opacity-60');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('active');
                canvas.classList.remove('border-primary', 'ring-2', 'ring-primary/20');
                label.classList.remove('text-primary');
                label.classList.add('text-slate-400', 'opacity-60');
            }
        });
    }

    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }

    onPrevPage() {
        if (this.pageNum <= 1) return;
        this.queueRenderPage(this.pageNum - 1);
    }

    onNextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) return;
        this.queueRenderPage(this.pageNum + 1);
    }

    changeScale(delta) {
        this.scale = Math.max(0.25, Math.min(5.0, this.scale + delta));
        this.zoomSelect.value = this.scale;
        this.renderPage(this.pageNum);
    }

    autoScale(mode) {
        const container = document.getElementById('viewer-container');
        const padding = 80;
        const availableWidth = container.clientWidth - (padding * 2);
        const availableHeight = container.clientHeight - (padding * 2);

        this.pdfDoc.getPage(this.pageNum).then(page => {
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            if (mode === 'page-width') {
                this.scale = availableWidth / unscaledViewport.width;
            } else if (mode === 'page-fit') {
                const scaleW = availableWidth / unscaledViewport.width;
                const scaleH = availableHeight / unscaledViewport.height;
                this.scale = Math.min(scaleW, scaleH);
            }
            this.renderPage(this.pageNum);
        });
    }

    async printDocument() {
        if (!this.pdfDoc) return;

        this.showLoading(true);
        this.printContainer.innerHTML = '';

        try {
            const pages = [];
            for (let i = 1; i <= this.pdfDoc.numPages; i++) {
                pages.push(i);
            }

            // Renderizamos todas las páginas en paralelo (más rápido)
            // Usamos escala 1.5 para un balance ideal entre velocidad y nitidez
            const renderPromises = pages.map(async (num) => {
                const page = await this.pdfDoc.getPage(num);
                const viewport = page.getViewport({ scale: 1.5 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.dataset.page = num;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                return canvas;
            });

            const renderedCanvases = await Promise.all(renderPromises);

            // Los añadimos al contenedor en orden
            renderedCanvases.sort((a, b) => a.dataset.page - b.dataset.page)
                .forEach(canvas => this.printContainer.appendChild(canvas));

            this.showLoading(false);
            window.print();

        } catch (err) {
            console.error('Error durante la impresión:', err);
            alert('Hubo un error al preparar el documento para imprimir.');
            this.showLoading(false);
        } finally {
            this.printContainer.innerHTML = '';
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingSpinner.classList.remove('hidden');
            this.canvas.classList.add('hidden');
        } else {
            this.loadingSpinner.classList.add('hidden');
            this.canvas.classList.remove('hidden');
        }
    }

    showError() {
        this.loadingSpinner.classList.add('hidden');
        this.errorMsg.classList.remove('hidden');
        this.docTitle.textContent = 'Error';
    }
}

window.addEventListener('DOMContentLoaded', () => new PDFViewer());
