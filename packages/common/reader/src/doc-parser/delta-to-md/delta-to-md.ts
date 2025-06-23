// eslint-disable
// @ts-nocheck
import { Node } from './utils/node';

export const deltaToMd = (delta, converters) => {
  return convert(delta, converters).render().trimEnd() + '\n';
};

function convert(ops, converters) {
  let group, line, el, activeInline, beginningOfLine;
  let root = new Node();

  function newLine() {
    el = line = new Node(['', '\n']);
    root.append(line);
    activeInline = {};
  }
  newLine();

  for (let i = 0; i < ops.length; i++) {
    let op = ops[i];

    if (typeof op.insert === 'object') {
      for (let k in op.insert) {
        if (converters.embed[k]) {
          applyInlineAttributes(op.attributes);
          converters.embed[k].call(el, op.insert[k], op.attributes);
        }
      }
    } else {
      let lines = op.insert.split('\n');

      if (hasBlockLevelAttribute(op.attributes, converters)) {
        // Some line-level styling (ie headings) is applied by inserting a \n
        // with the style; the style applies back to the previous \n.
        // There *should* only be one style in an insert operation.

        for (let j = 1; j < lines.length; j++) {
          for (let attr in op.attributes) {
            if (converters.block[attr]) {
              let fn = converters.block[attr];
              if (typeof fn === 'object') {
                if (group && group.type !== attr) {
                  group = null;
                }
                if (!group && fn.group) {
                  group = {
                    el: fn.group(),
                    type: attr,
                    value: op.attributes[attr],
                    distance: 0,
                  };
                  root.append(group.el);
                }

                if (group) {
                  group.el.append(line);
                  group.distance = 0;
                }
                fn = fn.line;
              }

              fn.call(line, op.attributes, group);
              newLine();
              break;
            }
          }
        }
        beginningOfLine = true;
      } else {
        for (let l = 0; l < lines.length; l++) {
          if ((l > 0 || beginningOfLine) && group && ++group.distance >= 2) {
            group = null;
          }
          applyInlineAttributes(
            op.attributes,
            ops[i + 1] && ops[i + 1].attributes
          );
          el.append(lines[l]);
          if (l < lines.length - 1) {
            newLine();
          }
        }
        beginningOfLine = false;
      }
    }
  }

  return root;

  function applyInlineAttributes(attrs, next?: any) {
    let first: any[] = [];
    let then: any[] = [];
    attrs = attrs || {};

    let tag = el,
      seen = {};
    while (tag._format) {
      seen[tag._format] = true;
      if (!attrs[tag._format] || tag.open !== tag.close) {
        for (let k in seen) {
          delete activeInline[k];
        }
        el = tag.parent();
      }

      tag = tag.parent();
    }

    for (let attr in attrs) {
      if (converters.inline[attr] && attrs[attr]) {
        if (activeInline[attr] && activeInline[attr] === attrs[attr]) {
          continue; // do nothing -- we should already be inside this style's tag
        }

        if (next && attrs[attr] === next[attr]) {
          first.push(attr); // if the next operation has the same style, this should be the outermost tag
        } else {
          then.push(attr);
        }
        activeInline[attr] = attrs[attr];
      }
    }

    first.forEach(apply);
    then.forEach(apply);

    function apply(fmt) {
      let newEl = converters.inline[fmt].call(null, attrs[fmt]);
      if (Array.isArray(newEl)) {
        newEl = new Node(newEl);
      }
      newEl._format = fmt;
      el.append(newEl);
      el = newEl;
    }
  }
}

function hasBlockLevelAttribute(attrs, converters) {
  for (let k in attrs) {
    if (Object.keys(converters.block).includes(k)) {
      return true;
    }
  }
  return false;
}
