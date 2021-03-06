import { Schema, NodeSpec, MarkSpec, MarkType, NodeType, Mark, ResolvedPos, Node as ProsemirrorNode, NodeRange } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { findSelectedNodeOfType, findParentNodeOfType } from 'prosemirror-utils';
import { liftTarget } from 'prosemirror-transform';

import { TextEditorNodeConfig } from '@/interfaces';

/**
 * Generate the Prosemirror schema structure for nodes from the general node configuration.
 */
export function generateSchemaNodes(schema: TextEditorNodeConfig[]) {
    const nodes = {
        doc: {
            content: 'block+',
        }
    } as { [x: string]: NodeSpec };
    schema.forEach((config) => {
        if (config.type === 'block') {
            nodes[config.name] = {
                content: 'inline*',
                group: 'block',
                attrs: config.attrs,
                parseDOM: [{
                    tag: `div.node-${config.name}`,
                    node: config.name,
                    getAttrs: (dom: Node | string) => {
                        let attrs = {} as any;
                        if (config.attrs) {
                            Object.keys(config.attrs).forEach((key) => {
                                let value = (dom as HTMLElement).getAttribute(`data-${key}`);
                                if (value) {
                                    attrs[key] = value;
                                }
                            });
                        }
                        return attrs;
                    }
                }],
                toDOM: (node) => {
                    let attributes = {
                        class: `node-${config.name}`,
                    } as any;
                    Object.entries(node.attrs).forEach(([key, value]) => {
                        attributes[`data-${key}`] = value;
                    });
                    return ['div', attributes, 0];
                },
            };
        } else if (config.type === 'wrapping') {
            nodes[config.name] = {
                content: config.content + '+',
                group: 'block',
                attrs: config.attrs,
                parseDOM: [{
                    tag: `div.node-${config.name}`,
                    getAttrs: (dom: Node | string) => {
                        let attrs = {} as any;
                        if (config.attrs) {
                            Object.keys(config.attrs).forEach((key) => {
                                let value = (dom as HTMLElement).getAttribute(`data-${key}`);
                                if (value) {
                                    attrs[key] = value;
                                }
                            });
                        }
                        return attrs;
                    }
                }],
                toDOM: (node: any) => {
                    let attributes = {
                        class: `node-${config.name}`,
                    } as any;
                    Object.entries(node.attrs).forEach(([key, value]) => {
                        attributes[`data-${key}`] = value;
                    });
                    return ['div', attributes, 0];
                },
            };
        } else if (config.type === 'inline' && config.name === 'text') {
            nodes.text = {
                group: 'inline',
            };
        } else if (config.type === 'inline' && config.name !== 'text') {
            nodes[config.name] = {
                content: 'inline*',
                group: 'inline',
                inline: true,
                attrs: config.attrs,
                parseDOM: [{
                    tag: `span.node-${config.name}`,
                    getAttrs: (dom: Node | string) => {
                        let attrs = {} as any;
                        if (config.attrs) {
                            Object.keys(config.attrs).forEach((key) => {
                                let value = (dom as HTMLElement).getAttribute(`data-${key}`);
                                if (value) {
                                    attrs[key] = value;
                                }
                            });
                        }
                        return attrs;
                    }
                }],
                toDOM: (node) => {
                    let attributes = {
                        class: `node-${config.name}`,
                    } as any;
                    Object.entries(node.attrs).forEach(([key, value]) => {
                        attributes[`data-${key}`] = value;
                    });
                    return ['span', attributes, 0];
                },
            };
        }
    });
    return nodes;
}

/**
 * Generate the Prosemirror schema structure for marks from the general node configuration.
 */
export function generateSchemaMarks(schema: TextEditorNodeConfig[]) {
    const marks = {
    } as { [x: string]: MarkSpec };
    schema.forEach((config) => {
        if (config.type === 'mark') {
            marks[config.name] = {
                attrs: config.attrs,
                parseDOM: [
                    {
                        tag: `span.mark-${config.name}`,
                        getAttrs: (dom: Node | string) => {
                            let attrs = {} as any;
                            if (config.attrs) {
                                Object.keys(config.attrs).forEach((key) => {
                                    let value = (dom as HTMLElement).getAttribute(`data-${key}`);
                                    if (value) {
                                        attrs[key] = value;
                                    }
                                });
                            }
                            return attrs;
                        }
                    },
                ],
                toDOM: (mark: any) => {
                    let attributes = {
                        class: `mark-${config.name}`,
                    } as any;
                    Object.entries(mark.attrs).forEach(([key, value]) => {
                        if (value) {
                            attributes[`data-${key}`] = value;
                        }
                    });
                    return ['span', attributes, 0]
                },
            };
        }
    });
    return marks;
}

/**
 * Calculate the full range of the given mark type.
 *
 * Taken from https://github.com/scrumpy/tiptap/blob/master/packages/tiptap-utils/src/utils/getMarkRange.js
 */
export function getMarkRange($pos: ResolvedPos, type: MarkType) {
    if (!$pos || !type) {
        return false;
    }
    const start = $pos.parent.childAfter($pos.parentOffset)
    if (!start.node) {
        return false;
    }
    const link = start.node.marks.find((mark: Mark) => { return mark.type === type; })
    if (!link) {
        return false;
    }
    let startIndex = $pos.index();
    let startPos = $pos.start() + start.offset;
    let endIndex = startIndex + 1;
    let endPos = startPos + start.node.nodeSize;
    while (startIndex > 0 && link.isInSet($pos.parent.child(startIndex - 1).marks)) {
        startIndex -= 1;
        startPos -= $pos.parent.child(startIndex).nodeSize;
    }
    while (endIndex < $pos.parent.childCount && link.isInSet($pos.parent.child(endIndex).marks)) {
        endPos += $pos.parent.child(endIndex).nodeSize;
        endIndex += 1;
    }
    return { from: startPos, to: endPos };
}

/**
 * Update the mark of the given type with the new attributes.
 */
export function updateMark(type: MarkType, attrs: {[x: string]: string}) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const { tr, selection, doc } = state;
        let { from, to } = selection;
        const { $from, empty } = selection;
        if (empty) {
            const range = getMarkRange($from, type)
            if (range) {
                from = range.from;
                to = range.to;
            }
        }
        const hasMark = doc.rangeHasMark(from, to, type)
        if (hasMark) {
            tr.removeMark(from, to, type)
        }
        tr.addMark(from, to, type.create(attrs))
        return dispatch(tr);
    }
}

/**
 * Remove the mark of the given type.
 */
export function removeMark(type: MarkType) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const { tr, selection, doc } = state;
        let { from, to } = selection;
        const { $from, empty } = selection;
        if (empty) {
            const range = getMarkRange($from, type)
            if (range) {
                from = range.from;
                to = range.to;
            }
        }
        const hasMark = doc.rangeHasMark(from, to, type)
        if (hasMark) {
            tr.removeMark(from, to, type)
            return dispatch(tr);
        }
    }
}

/**
 * Update the inline node of the given type with the given attributes.
 */
export function updateInlineNode(type: NodeType, attrs: {[x: string]: string}) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const result = findSelectedNodeOfType(type)(state.selection) || findParentNodeOfType(type)(state.selection);
        if (result) {
            const tr = state.tr.replaceRangeWith(result.pos, result.pos + result.node.nodeSize, type.create(attrs, result.node.content));
            dispatch(tr);
        }
    }
}

/**
 * Set the current block's type to contentType and then wrap it in the wrappingType block.
 */
export function wrapNode(wrappingType: NodeType, contentType: NodeType) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const { $from, $to } = state.selection;
        const range = $from.blockRange($to, (node) => {
            if (node.type.isInline) {
                return false;
            }
            return true;
        });

        if (range) {
            let tr = state.tr;
            if (contentType) {
                tr = tr.setBlockType(range.start, range.end, contentType);
                tr = tr.wrap(range, [{type: wrappingType}]);
            } else {
                tr = tr.wrap(range, [{type: wrappingType}]);
            }
            dispatch(tr);
        } else {
            return false;
        }
    }
}

/**
 * Unwrap the current wrapped node and set it to the given type.
 */
export function unwrapNode(type: NodeType) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const { $head } = state.selection;

        if ($head) {
            let start = -1;
            let end = -1;
            for (let depth = $head.depth; depth >= 0; depth--) {
                if ($head.node(depth).type === type) {
                    start = $head.start(depth);
                    end = $head.end(depth);
                    break;
                }
            }
            if (start >= 0 && end >= 0) {
                const nodeRange = state.doc.resolve(start + 1).blockRange(state.doc.resolve(end - 1));
                if (nodeRange) {
                    const target = liftTarget(nodeRange);
                    if (target !== undefined && target !== null) {
                        dispatch(state.tr.lift(nodeRange, target));
                        return true;
                    }
                }
            }
        }

        return false;
    }
}


export function updateBlockNodeAttrs(type: NodeType, attrs: { [x: string]: string }) {
    return (state: EditorState, dispatch: (tr: Transaction) => void) => {
        const { $head } = state.selection;

        if ($head) {
            let start = -1;
            let end = -1;
            let node = null;
            for (let depth = $head.depth; depth >= 0; depth--) {
                if ($head.node(depth).type === type) {
                    node = $head.node(depth);
                    start = $head.start(depth);
                    end = $head.end(depth);
                    break;
                }
            }
            if (start >= 0 && end >= 0 && node) {
                if (type.isTextblock) {
                    dispatch(state.tr.setBlockType(start + 1, end - 1, type, attrs));
                    return true;
                } else {
                    const nodeRangeUnwrap = state.doc.resolve(start + 1).blockRange(state.doc.resolve(end - 1));
                    if (nodeRangeUnwrap) {
                        const target = liftTarget(nodeRangeUnwrap);
                        if (target !== undefined && target !== null) {
                            let tr = state.tr.lift(nodeRangeUnwrap, target);
                            const nodeRangeWrap = tr.doc.resolve(start).blockRange(tr.doc.resolve(end - 3));
                            if (nodeRangeWrap) {
                                tr = tr.wrap(nodeRangeWrap, [{type: type, attrs: attrs}]);
                                dispatch(tr);
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    }
}

/**
 * Test if the current node is inside a wrapping node type.
 */
export function isWrappedNode(state: EditorState, schema: any[], editorSchema: Schema) {
    for (let idx = 0; idx < schema.length; idx++) {
        if (schema[idx].type === 'wrapping') {
            if (findParentNodeOfType(editorSchema.nodes[schema[idx].name])(state.selection)) {
                return true;
            }
        }
    }
    return false;
}
