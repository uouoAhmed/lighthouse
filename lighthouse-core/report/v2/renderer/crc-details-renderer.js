/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @fileoverview This file contains helpers for constructing and rendering the
 * critical request chains network tree.
 */

/* globals self Util2X */

class CriticalRequestChainRenderer2X {
  /**
   * Create render context for critical-request-chain tree display.
   * @param {!Object<string, !CriticalRequestChainRenderer2X.CRCNode>} tree
   * @return {{tree: !Object<string, !CriticalRequestChainRenderer2X.CRCNode>, startTime: number, transferSize: number}}
   */
  static initTree(tree) {
    let startTime = 0;
    const rootNodes = Object.keys(tree);
    if (rootNodes.length > 0) {
      const node = tree[rootNodes[0]];
      startTime = node.request.startTime;
    }

    return {tree, startTime, transferSize: 0};
  }

  /**
   * Helper to create context for each critical-request-chain node based on its
   * parent. Calculates if this node is the last child, whether it has any
   * children itself and what the tree looks like all the way back up to the root,
   * so the tree markers can be drawn correctly.
   * @param {!Object<string, !CriticalRequestChainRenderer2X.CRCNode>} parent
   * @param {string} id
   * @param {number} startTime
   * @param {number} transferSize
   * @param {!Array<boolean>=} treeMarkers
   * @param {boolean=} parentIsLastChild
   * @return {!CriticalRequestChainRenderer2X.CRCSegment}
   */
  static createSegment(parent, id, startTime, transferSize, treeMarkers, parentIsLastChild) {
    const node = parent[id];
    const siblings = Object.keys(parent);
    const isLastChild = siblings.indexOf(id) === (siblings.length - 1);
    const hasChildren = Object.keys(node.children).length > 0;

    // Copy the tree markers so that we don't change by reference.
    const newTreeMarkers = Array.isArray(treeMarkers) ? treeMarkers.slice(0) : [];

    // Add on the new entry.
    if (typeof parentIsLastChild !== 'undefined') {
      newTreeMarkers.push(!parentIsLastChild);
    }

    return {
      node,
      isLastChild,
      hasChildren,
      startTime,
      transferSize: transferSize + node.request.transferSize,
      treeMarkers: newTreeMarkers,
    };
  }

  /**
   * Creates the DOM2X for a tree segment.
   * @param {!DOM2X} dom
   * @param {!DocumentFragment} tmpl
   * @param {!CriticalRequestChainRenderer2X.CRCSegment} segment
   * @return {!Node}
   */
  static createChainNode(dom, tmpl, segment) {
    const chainsEl = dom.cloneTemplate('#tmpl-lh-crc__chains', tmpl);

    // Hovering over request shows full URL.
    dom.find('.crc-node', chainsEl).setAttribute('title', segment.node.request.url);

    const treeMarkeEl = dom.find('.crc-node__tree-marker', chainsEl);

    // Construct lines and add spacers for sub requests.
    segment.treeMarkers.forEach(separator => {
      if (separator) {
        treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker vert'));
        treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker'));
      } else {
        treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker'));
        treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker'));
      }
    });

    if (segment.isLastChild) {
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker up-right'));
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker right'));
    } else {
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker vert-right'));
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker right'));
    }

    if (segment.hasChildren) {
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker horiz-down'));
    } else {
      treeMarkeEl.appendChild(dom.createElement('span', 'tree-marker right'));
    }

    // Fill in url, host, and request size information.
    const {file, hostname} = Util2X.parseURL(segment.node.request.url);
    const treevalEl = dom.find('.crc-node__tree-value', chainsEl);
    dom.find('.crc-node__tree-file', treevalEl).textContent = `${file}`;
    dom.find('.crc-node__tree-hostname', treevalEl).textContent = `(${hostname})`;

    if (!segment.hasChildren) {
      const span = dom.createElement('span', 'crc-node__chain-duration');
      span.textContent = ' - ' + Util2X.chainDuration(
          segment.node.request.startTime, segment.node.request.endTime) + 'ms, ';
      const span2 = dom.createElement('span', 'crc-node__chain-duration');
      span2.textContent = Util2X.formatBytesToKB(segment.node.request.transferSize);

      treevalEl.appendChild(span);
      treevalEl.appendChild(span2);
    }

    return chainsEl;
  }

  /**
   * Recursively builds a tree from segments.
   * @param {!DOM2X} dom
   * @param {!DocumentFragment} tmpl
   * @param {!CriticalRequestChainRenderer2X.CRCSegment} segment
   * @param {!Element} detailsEl Parent details element.
   * @param {!CriticalRequestChainRenderer2X.CRCDetailsJSON} details
   */
  static buildTree(dom, tmpl, segment, detailsEl, details) {
    detailsEl.appendChild(CriticalRequestChainRenderer2X.createChainNode(dom, tmpl, segment));

    for (const key of Object.keys(segment.node.children)) {
      const childSegment = CriticalRequestChainRenderer2X.createSegment(segment.node.children, key,
         segment.startTime, segment.transferSize, segment.treeMarkers, segment.isLastChild);
      CriticalRequestChainRenderer2X.buildTree(dom, tmpl, childSegment, detailsEl, details);
    }
  }

  /**
   * @param {!DOM2X} dom
   * @param {!Node} templateContext
   * @param {!CriticalRequestChainRenderer2X.CRCDetailsJSON} details
   * @return {!Node}
   */
  static render(dom, templateContext, details) {
    const tmpl = dom.cloneTemplate('#tmpl-lh-crc', templateContext);

    // Fill in top summary.
    dom.find('.lh-crc__longest_duration', tmpl).textContent =
        Util2X.formatNumber(details.longestChain.duration) + 'ms';
    dom.find('.lh-crc__longest_length', tmpl).textContent = details.longestChain.length;
    dom.find('.lh-crc__longest_transfersize', tmpl).textContent =
        Util2X.formatBytesToKB(details.longestChain.transferSize);

    const detailsEl = dom.find('.lh-details', tmpl);
    detailsEl.open = true;

    dom.find('.lh-details > summary', tmpl).textContent = details.header.text;

    // Construct visual tree.
    const root = CriticalRequestChainRenderer2X.initTree(details.chains);
    for (const key of Object.keys(root.tree)) {
      const segment = CriticalRequestChainRenderer2X.createSegment(root.tree, key,
          root.startTime, root.transferSize);
      CriticalRequestChainRenderer2X.buildTree(dom, tmpl, segment, detailsEl, details);
    }

    return tmpl;
  }
}

// Allow Node require()'ing.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CriticalRequestChainRenderer2X;
} else {
  self.CriticalRequestChainRenderer2X = CriticalRequestChainRenderer2X;
}

/** @typedef {{
 *     type: string,
 *     header: {text: string},
 *     longestChain: {duration: number, length: number, transferSize: number},
 *     chains: !Object<string, !CriticalRequestChainRenderer2X.CRCNode>
 * }}
 */
CriticalRequestChainRenderer2X.CRCDetailsJSON; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     endTime: number,
 *     responseReceivedTime: number,
 *     startTime: number,
 *     transferSize: number,
 *     url: string
 * }}
 */
CriticalRequestChainRenderer2X.CRCRequest; // eslint-disable-line no-unused-expressions

/**
 * Record type so children can circularly have CRCNode values.
 * @struct
 * @record
 */
CriticalRequestChainRenderer2X.CRCNode = function() {};

/** @type {!Object<string, !CriticalRequestChainRenderer2X.CRCNode>} */
CriticalRequestChainRenderer2X.CRCNode.prototype.children; // eslint-disable-line no-unused-expressions

/** @type {!CriticalRequestChainRenderer2X.CRCRequest} */
CriticalRequestChainRenderer2X.CRCNode.prototype.request; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     node: !CriticalRequestChainRenderer2X.CRCNode,
 *     isLastChild: boolean,
 *     hasChildren: boolean,
 *     startTime: number,
 *     transferSize: number,
 *     treeMarkers: !Array<boolean>
 * }}
 */
CriticalRequestChainRenderer2X.CRCSegment; // eslint-disable-line no-unused-expressions
