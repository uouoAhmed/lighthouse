/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const Node = require('../lib/dependency-graph/node');
const CPUNode = require('../lib/dependency-graph/cpu-node');
const NetworkNode = require('../lib/dependency-graph/network-node');

const toMicroS = ms => Math.round(ms * 1000);

class TraceBuilder {

  constructor() {
    this.pid = null;
    this.tid = null;

  }
  /**
   * Generates a chromium trace file from dependency graph nodes
   * @param {!Array<CPUNode | NetworkNode>} nodes
   * @param {LH.Gatherer.Simulation.Result.nodeTiming} nodeTiming
   */
  createTraceEvents(nodes, nodeTiming) {
    const currentTrace = /** @type {Array<LH.TraceEvent>} */ ([]);
    nodes.sort((a, b) => a.startTime - b.startTime);
    nodes.forEach((node, i) => {
      if (node.type === 'cpu') {
        const traceEvent = /** @type {!CPUNode} */ (node).event;
        const newTiming = nodeTiming.get(node);
        traceEvent.ts = newTiming.startTime * 1000;
        traceEvent.dur = (newTiming.endTime - newTiming.startTime) * 1000
        currentTrace.push(/** @type {!CPUNode} */ (node).event);
      } else if (node.type === 'network') {
        const newTiming = nodeTiming.get(node);
        const networkEvents = this.createTraceEventsFromNetworkNode(/** @type {!NetworkNode} */ (node).record, newTiming);
        currentTrace.push(...networkEvents.filter(Boolean));
      }
    });
    return currentTrace;
  }

  /**
   * node.startTime and .endTime are microseconds
   * traceEvent.ts is microseconds
   *
   * traceEvent(receiveResponse).args.data.requestTime is a TS in SECONDS
   *
   * nodeTimings are millisececonds
   * traceEvent(resourcefinish).finishTime is milliseconds
   * traceEvent(receiveResponse).args.data.* is milliseconds - requestTime
   */

  /**
   * @param {!LH.NetworkRequest} record
   * @param {LH.Gatherer.Simulation.NodeTiming} newTiming
   */
  createTraceEventsFromNetworkNode(record, newTiming) {
    if (typeof this.pid !== 'number' || typeof this.tid !== 'number') throw new Error('Need pid/tid');
    if (typeof newTiming === 'undefined') throw new Error('No nodeTiming for network node found');

    const eventBase = {
      pid: this.pid,
      tid: this.tid,
      name: '',
      ph: 'I',
      cat: 'devtools.timeline',
      args: {data: {requestId: record.requestId}},
    };

    const {url, requestMethod, timing, statusCode, mimeType, endTime} = record;

    const startData = {url, requestMethod, priority: record.priority()};
    const start   = smooshData({...eventBase, ...{name: 'ResourceSendRequest', ts: toMicroS(newTiming.queuedTime)}}, startData);

    let receive;
    if (!record.canceled && !record.failed) {
      const grossEstimatedReceiveResponse = (newTiming.startTime + newTiming.endTime) / 2;
      const reqTimeOrigin = newTiming.queuedTime;
      const adjustedTiming = {
        requestTime: Math.round(reqTimeOrigin / 1000),
        // the following two are deltas from the requestTime
        sendStart: newTiming.startTime - reqTimeOrigin,
        receiveHeadersEnd: grossEstimatedReceiveResponse - reqTimeOrigin,
      }
      const receiveData = {statusCode, mimeType, fromServiceWorker: record.fetchedViaServiceWorker, timing: adjustedTiming};
      receive = smooshData({...eventBase, ...{name: 'ResourceReceiveResponse', ts: toMicroS(grossEstimatedReceiveResponse)}}, receiveData);
    }

    const endData = {finishTime: newTiming.endTime, encodedDataLength: record.transferSize, decodedBodyLength: record.resourceSize, didFail: !!record.failed};
    const end     = smooshData({...eventBase, ...{name: 'ResourceFinish', ts: toMicroS(newTiming.endTime)}}, endData);
    return [start, receive, end];

    /**
     * @param {!LH.TraceEvent} traceEvent
     * @param {Object} data
     * @return {!LH.TraceEvent}
     */
    function smooshData(traceEvent, data = {}) {
      traceEvent.args = {
        data: {
          ...traceEvent.args.data,
          ...data
        }
      };
      return traceEvent;
    }
  }

  /**
   * Writes a trace file to disk
   * @param {!Array<!LH.TraceEvent>} events
   * @param {?string} traceFilePath where to save the trace file
   */
  saveTrace(events, traceFilePath) {
    const jsonStr = `{"traceEvents":[
    ${events.map(evt => JSON.stringify(evt)).join(',\n')}
  ]}`;

    traceFilePath = path.resolve(process.cwd(), traceFilePath || 'depgraph.trace.json');

    fs.writeFileSync(traceFilePath, jsonStr, 'utf8');
    process.stdout.write(`
  > dep graph trace file saved to: ${traceFilePath}
  > Open this file in devtools (or tracing).\n`);
  }

  /**
   *
   * @param {number} ts
   */
  createLandmarkEvents(ts) {
    // These are events need to be there for DevTools to load it.
    const traceBase = {
      cat: 'disabled-by-default-devtools.timeline',
      ts: ts - 100,
      pid: this.pid,
      tid: this.tid,
      ph: 'I',
      args: {},
    };

    const startedInPage = {
      ...traceBase,
      name: 'TracingStartedInPage',
      args: {data: {sessionId: '-1'}}
    };
    const startedInBrowser = {
      ...traceBase,
      name: 'TracingStartedInBrowser'
    };
    return [startedInPage, startedInBrowser];
  }
  /**
   *
   * @param {!Array<!Node>} nodes
   */
  getThreadInfo(nodes) {
    const firstCPUNode = /** @type {!CPUNode!} */ (nodes.find(node => node.type === 'cpu'));
    if (!firstCPUNode) throw new Error('No CPU nodes in the trace?');
    this.pid = firstCPUNode.event.pid;
    this.tid = firstCPUNode.event.tid;
  }

  /**
   *
   * @param {!Node} rootNode
   * @param {LH.Gatherer.Simulation.NodeTiming} nodeTiming
   * @param {string} filePath
   */
  static saveTraceOfGraph(rootNode, nodeTiming, filePath) {
    const nodes = /** @type {!Array<!Node>!} */ ([]);
    rootNode.traverse(node => nodes.push(node));

    const builder = new TraceBuilder();
    builder.getThreadInfo(nodes);
    const events = builder.createTraceEvents(nodes, nodeTiming);
    const landmarkEvents = builder.createLandmarkEvents(events[0].ts);
    events.unshift(...landmarkEvents);
    return builder.saveTrace(events, filePath);
  }
}

module.exports = TraceBuilder;
