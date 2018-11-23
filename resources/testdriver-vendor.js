(function() {
"use strict";

const get_selector = function(element) {
    let selector;

    if (element.id && document.getElementById(element.id) === element) {
        const id = element.id;

        selector = "#";
        // escape everything, because it's easy to implement
        for (let i = 0, len = id.length; i < len; i++) {
            selector += '\\' + id.charCodeAt(i).toString(16) + ' ';
        }
    } else {
        // push and then reverse to avoid O(n) unshift in the loop
        let segments = [];
        for (let node = element;
             node.parentElement;
             node = node.parentElement) {
            let segment = "*|" + node.localName;
            let nth = Array.prototype.indexOf.call(node.parentElement.children, node) + 1;
            segments.push(segment + ":nth-child(" + nth + ")");
        }
        segments.push(":root");
        segments.reverse();

        selector = segments.join(" > ");
    }

    return selector;
};

window.test_driver_internal.click = function(element) {
    const selector = get_selector(element);
    return window._wptrunner_click_(selector);
};

window.test_driver_internal.send_keys = function(element, keys) {
    const selector = get_selector(element);
    return window._wptrunner_type_(selector, keys);
};

window.test_driver_internal.action_sequence = function(actions) {
    for (const action of actions) {
        if (action.type !== "pointer") {
            continue;
        }
        for (const a of action.actions) {
            if (a.origin instanceof Element) {
                a.origin = get_selector(a.origin);
            }
        }
    }
    return window._wptrunner_action_sequence_(actions);
};

})();
