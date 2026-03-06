/**
 * Flux Sandbox JSON Editor
 * A lightweight, dark-themed tree+code JSON editor.
 */
class FluxJsonEditor {
    constructor(container) {
        this.container = container;
        this.data = {};
        this.mode = 'tree'; // 'tree' | 'code'
        this.collapsed = new Set();
        this.render();
    }

    set(data) {
        this.data = structuredClone(data);
        this.collapsed.clear();
        this.renderContent();
    }

    get() {
        if (this.mode === 'code') {
            const ta = this.container.querySelector('.fje-code');
            if (ta) this.data = JSON.parse(ta.value);
        }
        return structuredClone(this.data);
    }

    render() {
        this.container.innerHTML = '';
        this.container.className = (this.container.className || '') + ' fje-root';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'fje-toolbar';
        toolbar.innerHTML = `
            <div class="fje-tabs">
                <button class="fje-tab ${this.mode === 'tree' ? 'active' : ''}" data-mode="tree">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    Tree
                </button>
                <button class="fje-tab ${this.mode === 'code' ? 'active' : ''}" data-mode="code">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    Code
                </button>
            </div>
            <div class="fje-actions">
                <button class="fje-btn-icon fje-collapse-all" title="Collapse all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
                <button class="fje-btn-icon fje-expand-all" title="Expand all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
            </div>
        `;
        this.container.appendChild(toolbar);

        toolbar.querySelectorAll('.fje-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (this.mode === 'code') {
                    try {
                        const ta = this.container.querySelector('.fje-code');
                        if (ta) this.data = JSON.parse(ta.value);
                    } catch (e) {
                        showToast('Fix JSON errors before switching to Tree view', 'error');
                        return;
                    }
                }
                this.mode = tab.dataset.mode;
                toolbar.querySelectorAll('.fje-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderContent();
            });
        });

        toolbar.querySelector('.fje-collapse-all').addEventListener('click', () => {
            this._collapseAll(this.data, '');
            this.renderContent();
        });
        toolbar.querySelector('.fje-expand-all').addEventListener('click', () => {
            this.collapsed.clear();
            this.renderContent();
        });

        // Content area
        const content = document.createElement('div');
        content.className = 'fje-content';
        this.container.appendChild(content);
        this.renderContent();
    }

    _collapseAll(obj, prefix) {
        if (obj && typeof obj === 'object') {
            this.collapsed.add(prefix);
            const entries = Array.isArray(obj) ? obj.map((v, i) => [i, v]) : Object.entries(obj);
            for (const [k, v] of entries) {
                const path = prefix ? `${prefix}.${k}` : String(k);
                if (v && typeof v === 'object') this._collapseAll(v, path);
            }
        }
    }

    renderContent() {
        const content = this.container.querySelector('.fje-content');
        if (!content) return;
        content.innerHTML = '';

        if (this.mode === 'code') {
            const ta = document.createElement('textarea');
            ta.className = 'fje-code';
            ta.spellcheck = false;
            ta.value = JSON.stringify(this.data, null, 2);
            content.appendChild(ta);
        } else {
            const tree = document.createElement('div');
            tree.className = 'fje-tree';
            this._renderNode(tree, this.data, '', null, true);
            content.appendChild(tree);
        }
    }

    _renderNode(parent, value, path, key, isRoot = false) {
        const isObj = value !== null && typeof value === 'object';
        const isArr = Array.isArray(value);
        const row = document.createElement('div');
        row.className = 'fje-row';

        if (isObj) {
            const isCollapsed = this.collapsed.has(path);
            const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
            const count = entries.length;

            // Toggle arrow
            const arrow = document.createElement('span');
            arrow.className = `fje-arrow ${isCollapsed ? 'collapsed' : ''}`;
            arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.collapsed.has(path)) this.collapsed.delete(path);
                else this.collapsed.add(path);
                this.renderContent();
            });
            row.appendChild(arrow);

            // Key label
            if (key !== null && !isRoot) {
                const keyEl = document.createElement('span');
                keyEl.className = 'fje-key';
                keyEl.textContent = key;
                row.appendChild(keyEl);
                row.appendChild(this._colon());
            }

            // Preview
            const preview = document.createElement('span');
            preview.className = 'fje-preview';
            if (isCollapsed) {
                preview.textContent = isArr ? `[ ${count} items ]` : `{ ${count} keys }`;
            } else {
                preview.textContent = isArr ? `[` : `{`;
            }
            row.appendChild(preview);

            parent.appendChild(row);

            if (!isCollapsed) {
                const children = document.createElement('div');
                children.className = 'fje-children';
                for (const [k, v] of entries) {
                    const childPath = path ? `${path}.${k}` : String(k);
                    this._renderNode(children, v, childPath, isArr ? k : k);
                }

                // Add key button for objects
                if (!isArr) {
                    const addRow = document.createElement('div');
                    addRow.className = 'fje-row fje-add-row';
                    addRow.innerHTML = `<span class="fje-add-btn">+ add key</span>`;
                    addRow.querySelector('.fje-add-btn').addEventListener('click', () => {
                        const newKey = prompt('Key name:');
                        if (newKey !== null && newKey.trim()) {
                            this._setAtPath(path, newKey.trim(), null);
                            this.renderContent();
                        }
                    });
                    children.appendChild(addRow);
                }

                parent.appendChild(children);

                // Closing bracket
                const close = document.createElement('div');
                close.className = 'fje-row fje-close';
                close.textContent = isArr ? ']' : '}';
                parent.appendChild(close);
            }
        } else {
            // Spacer for leaf alignment
            const spacer = document.createElement('span');
            spacer.className = 'fje-arrow-spacer';
            row.appendChild(spacer);

            // Key
            if (key !== null) {
                const keyEl = document.createElement('span');
                keyEl.className = 'fje-key';
                keyEl.textContent = key;
                row.appendChild(keyEl);
                row.appendChild(this._colon());
            }

            // Value
            const valEl = document.createElement('span');
            valEl.className = `fje-val fje-${this._typeOf(value)}`;
            valEl.textContent = this._formatValue(value);
            valEl.title = 'Click to edit';
            valEl.addEventListener('click', () => this._editValue(path, value, valEl));
            row.appendChild(valEl);

            // Delete button
            const del = document.createElement('span');
            del.className = 'fje-delete';
            del.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            del.title = 'Delete';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteAtPath(path);
                this.renderContent();
            });
            row.appendChild(del);

            parent.appendChild(row);
        }
    }

    _colon() {
        const c = document.createElement('span');
        c.className = 'fje-colon';
        c.textContent = ':';
        return c;
    }

    _typeOf(v) {
        if (v === null) return 'null';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'number') return 'number';
        return 'string';
    }

    _formatValue(v) {
        if (v === null) return 'null';
        if (typeof v === 'string') return `"${v}"`;
        return String(v);
    }

    _editValue(path, currentValue, el) {
        const input = document.createElement('input');
        input.className = 'fje-input';
        input.value = typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'fje-type-select';
        ['string', 'number', 'boolean', 'null'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === this._typeOf(currentValue)) opt.selected = true;
            typeSelect.appendChild(opt);
        });

        const container = document.createElement('span');
        container.className = 'fje-edit-group';
        container.appendChild(input);
        container.appendChild(typeSelect);

        el.replaceWith(container);
        input.focus();
        input.select();

        const commit = () => {
            let newVal;
            const type = typeSelect.value;
            try {
                if (type === 'null') newVal = null;
                else if (type === 'boolean') newVal = input.value === 'true';
                else if (type === 'number') newVal = Number(input.value);
                else newVal = input.value;
            } catch { newVal = input.value; }
            this._setValueAtPath(path, newVal);
            this.renderContent();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') this.renderContent();
        });
        input.addEventListener('blur', () => {
            // Small delay to allow type select click
            setTimeout(() => {
                if (!container.contains(document.activeElement)) commit();
            }, 150);
        });
    }

    _getParentAndKey(path) {
        const parts = path.split('.');
        const lastKey = parts.pop();
        let target = this.data;
        for (const p of parts) {
            if (Array.isArray(target)) target = target[parseInt(p)];
            else target = target[p];
        }
        return { parent: target, key: Array.isArray(target) ? parseInt(lastKey) : lastKey };
    }

    _setValueAtPath(path, value) {
        const { parent, key } = this._getParentAndKey(path);
        parent[key] = value;
    }

    _setAtPath(path, newKey, value) {
        let target = this.data;
        if (path) {
            const parts = path.split('.');
            for (const p of parts) {
                if (Array.isArray(target)) target = target[parseInt(p)];
                else target = target[p];
            }
        }
        target[newKey] = value;
    }

    _deleteAtPath(path) {
        const { parent, key } = this._getParentAndKey(path);
        if (Array.isArray(parent)) parent.splice(key, 1);
        else delete parent[key];
    }
}
