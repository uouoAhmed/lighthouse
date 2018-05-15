/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env mocha, browser */

const assert = require('assert');
const fs = require('fs');
const jsdom = require('jsdom');
const Util2X = require('../../../../report/v2/renderer/util.js');
const URL = require('../../../../lib/url-shim');
const DOM2X = require('../../../../report/v2/renderer/dom.js');
const DetailsRenderer2X = require('../../../../report/v2/renderer/details-renderer.js');
const CriticalRequestChainRenderer2X = require(
    '../../../../report/v2/renderer/crc-details-renderer.js');
const CategoryRenderer2X = require('../../../../report/v2/renderer/category-renderer.js');
const sampleResults = require('../../../results/sample_v2.json');

const TEMPLATE_FILE = fs.readFileSync(__dirname + '/../../../../report/v2/templates.html', 'utf8');

describe('CategoryRenderer2X', () => {
  let renderer;

  before(() => {
    global.URL = URL;
    global.Util2X = Util2X;
    global.CriticalRequestChainRenderer2X = CriticalRequestChainRenderer2X;
    global.CategoryRenderer2X = CategoryRenderer2X;

    const PerformanceCategoryRenderer2X =
        require('../../../../report/v2/renderer/performance-category-renderer.js');

    const document = jsdom.jsdom(TEMPLATE_FILE);
    const dom = new DOM2X(document);
    const detailsRenderer = new DetailsRenderer2X(dom);
    renderer = new PerformanceCategoryRenderer2X(dom, detailsRenderer);
  });

  after(() => {
    global.URL = undefined;
    global.Util2X = undefined;
    global.CriticalRequestChainRenderer2X = undefined;
    global.CategoryRenderer2X = undefined;
  });

  const category = sampleResults.reportCategories.find(cat => cat.id === 'performance');

  it('renders the category header', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);
    const score = categoryDOM2X.querySelector('.lh-score');
    const value = categoryDOM2X.querySelector('.lh-score  > .lh-score__value');
    const title = score.querySelector('.lh-score__title');

    assert.deepEqual(score, score.firstElementChild, 'first child is a score');
    assert.ok(value.classList.contains('lh-score__value--numeric'),
              'category score is numeric');
    assert.equal(value.textContent, Math.round(category.score), 'category score is rounded');
    assert.equal(title.textContent, category.name, 'title is set');
  });

  it('renders the sections', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);
    const sections = categoryDOM2X.querySelectorAll('.lh-category > .lh-audit-group');
    assert.equal(sections.length, 4);
  });

  it('renders the metrics', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);
    const metricsSection = categoryDOM2X.querySelectorAll('.lh-category > .lh-audit-group')[0];

    const metricAudits = category.audits.filter(audit => audit.group === 'perf-metric');
    const timelineElements = metricsSection.querySelectorAll('.lh-timeline-metric');
    const nontimelineElements = metricsSection.querySelectorAll('.lh-audit');
    assert.equal(timelineElements.length + nontimelineElements.length, metricAudits.length);
  });

  it('renders the failing performance hints', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);

    const hintAudits = category.audits.filter(audit => audit.group === 'perf-hint' &&
        audit.score !== 100);
    const hintElements = categoryDOM2X.querySelectorAll('.lh-perf-hint');
    assert.equal(hintElements.length, hintAudits.length);

    const hintElement = hintElements[0];
    const hintSparklineElement = hintElement.querySelector('.lh-perf-hint__sparkline');
    assert.ok(hintElement.querySelector('.lh-perf-hint__title'), 'did not render title');
    assert.ok(hintSparklineElement, 'did not render sparkline');
    assert.ok(hintElement.querySelector('.lh-perf-hint__stats'), 'did not render stats');
    assert.ok(hintSparklineElement.title, 'did not render tooltip');
  });

  it('renders the performance hints with a debug string', () => {
    const auditWithDebug = {
      score: 0,
      group: 'perf-hint',
      result: {rawValue: 100, debugString: 'Yikes!', description: 'Bug'},
    };

    const fakeAudits = category.audits.concat(auditWithDebug);
    const fakeCategory = Object.assign({}, category, {audits: fakeAudits});
    const categoryDOM2X = renderer.render(fakeCategory, sampleResults.reportGroups);

    const debugEl = categoryDOM2X.querySelector('.lh-perf-hint .lh-debug');
    assert.ok(debugEl, 'did not render debug');
  });

  it('renders the performance hints with no extended info', () => {
    const buggyAudit = {
      score: 0,
      group: 'perf-hint',
      result: {debugString: 'Yikes!', description: 'Bug'},
    };

    const fakeAudits = category.audits.concat(buggyAudit);
    const fakeCategory = Object.assign({}, category, {audits: fakeAudits});
    const categoryDOM2X = renderer.render(fakeCategory, sampleResults.reportGroups);

    const debugEl = categoryDOM2X.querySelector('.lh-perf-hint .lh-debug');
    assert.ok(debugEl, 'did not render debug');
  });

  it('renders the failing diagnostics', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);
    const diagnosticSection = categoryDOM2X.querySelectorAll('.lh-category > .lh-audit-group')[2];

    const diagnosticAudits = category.audits.filter(audit => audit.group === 'perf-info' &&
        audit.score !== 100);
    const diagnosticElements = diagnosticSection.querySelectorAll('.lh-audit');
    assert.equal(diagnosticElements.length, diagnosticAudits.length);
  });

  it('renders the passed audits', () => {
    const categoryDOM2X = renderer.render(category, sampleResults.reportGroups);
    const passedSection = categoryDOM2X.querySelector('.lh-category > .lh-passed-audits');

    const passedAudits = category.audits.filter(audit => audit.group !== 'perf-metric' &&
        audit.score === 100);
    const passedElements = passedSection.querySelectorAll('.lh-audit');
    assert.equal(passedElements.length, passedAudits.length);
  });
});
