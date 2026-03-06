/**
 * Require shim for esbuild's external references.
 * Provides browser-compatible modules for React, ReactDOM, and lucide-react.
 */
window.require = function (mod) {
    if (mod === 'react') return window.React;
    if (mod === 'react-dom') return window.ReactDOM;
    if (mod === 'react/jsx-runtime' || mod === 'react/jsx-dev-runtime') {
        return {
            jsx: function (type, props, key) { return window.React.createElement(type, { ...props, key }); },
            jsxs: function (type, props, key) { return window.React.createElement(type, { ...props, key }); },
            jsxDEV: function (type, props, key) { return window.React.createElement(type, { ...props, key }); },
            Fragment: window.React.Fragment
        };
    }
    if (mod === 'lucide-react') {
        return new Proxy({}, {
            get: function (target, prop) {
                if (prop === '__esModule') return true;
                return function (props) {
                    if (window.LucideReact && window.LucideReact[prop]) {
                        return window.React.createElement(window.LucideReact[prop], props);
                    }
                    const pascalToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
                    const camelName = prop.charAt(0).toLowerCase() + prop.slice(1);
                    const kebabName = pascalToKebab(prop);
                    let iconSvg = null;
                    if (window.lucide && window.lucide.icons) {
                        iconSvg = window.lucide.icons[prop] || window.lucide.icons[camelName] || window.lucide.icons[kebabName];
                    }
                    if (iconSvg) {
                        return window.React.createElement('span', {
                            ...props,
                            ref: (el) => {
                                if (el && !el.hasChildNodes()) {
                                    const iconElement = window.lucide.createElement(iconSvg);
                                    iconElement.setAttribute('class', `lucide lucide-${kebabName} ${props.className || ''}`.trim());
                                    if (props.size) { iconElement.setAttribute('width', props.size); iconElement.setAttribute('height', props.size); }
                                    if (props.color) { iconElement.setAttribute('stroke', props.color); }
                                    el.appendChild(iconElement);
                                }
                            }
                        });
                    }
                    return window.React.createElement('span', { className: props?.className, style: { fontSize: '10px', color: '#888' } }, `[${prop}]`);
                };
            }
        });
    }
    throw new Error('Module not found in sandbox environment: ' + mod);
};
