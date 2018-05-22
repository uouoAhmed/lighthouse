/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env mocha */
const BootupTime = require('../../audits/bootup-time.js');
const Runner = require('../../runner.js');
const assert = require('assert');
const {groupIdToName} = require('../../lib/task-groups');

const acceptableTrace = require('../fixtures/traces/progressive-app-m60.json');
const errorTrace = require('../fixtures/traces/airhorner_no_fcp.json');

describe('Performance: bootup-time audit', () => {
  const auditOptions = Object.assign({}, BootupTime.defaultOptions, {thresholdInMs: 10});
  const roundedValueOf = (output, name) => {
    const value = output.extendedInfo.value[name];
    const roundedValue = {};
    Object.keys(value).forEach(key => roundedValue[key] = Math.round(value[key] * 10) / 10);
    return roundedValue;
  };

  it('should compute the correct BootupTime values', () => {
    const artifacts = Object.assign({
      traces: {
        [BootupTime.DEFAULT_PASS]: acceptableTrace,
      },
    }, Runner.instantiateComputedArtifacts());

    return BootupTime.audit(artifacts, {options: auditOptions}).then(output => {
      assert.equal(output.details.items.length, 4);
      assert.equal(output.score, 1);
      assert.equal(Math.round(output.rawValue), 155);

      assert.deepEqual(roundedValueOf(output, 'https://pwa.rocks/script.js'), {[groupIdToName.scripting]: 31.8, [groupIdToName.styleLayout]: 5.5, [groupIdToName.scriptParseCompile]: 1.3});
      assert.deepEqual(roundedValueOf(output, 'https://www.googletagmanager.com/gtm.js?id=GTM-Q5SW'), {[groupIdToName.scripting]: 25, [groupIdToName.scriptParseCompile]: 5.5, [groupIdToName.styleLayout]: 1.2});
      assert.deepEqual(roundedValueOf(output, 'https://www.google-analytics.com/plugins/ua/linkid.js'), {[groupIdToName.scripting]: 25.2, [groupIdToName.scriptParseCompile]: 1.2});
      assert.deepEqual(roundedValueOf(output, 'https://www.google-analytics.com/analytics.js'), {[groupIdToName.scripting]: 40.1, [groupIdToName.scriptParseCompile]: 9.6, [groupIdToName.styleLayout]: 0.2});

      assert.ok(output.details.items.length < Object.keys(output.extendedInfo.value).length,
          'Items below threshold were not filtered out');
    });
  }).timeout(10000);

  it('should summarize js exec timing costs', () => {
    const executionTimings = new Map([
      ['file-a.js', {
        'Parsing HTML & CSS': 150,
        'Script Parsing & Compile': 10,
        'Script Evaluation': 5,
      }],
      ['file-b.js', {'Style & Layout': 270}],
      ['file-c.js', {'Script Evaluation': 330}],
      ['file-d.js', {'Script Evaluation': 410}],
    ]);

    const {results, totalBootupTime} = BootupTime.execCostsByURL(executionTimings, {
      options: BootupTime.defaultOptions,
    });
    const expected = [
      {
        url: 'file-d.js',
        sum: 410,
        scripting: 410,
        scriptParseCompile: 0,
      },
      {
        url: 'file-c.js',
        sum: 330,
        scripting: 330,
        scriptParseCompile: 0,
      },
    ];
    assert.deepStrictEqual(results, expected, 'non-js groups (and sums < 50) filtered out');
    assert.equal(totalBootupTime, 10 + 5 + 330 + 410);
  });

  it('should compute the correct values when simulated', async () => {
    const artifacts = Object.assign({
      traces: {defaultPass: acceptableTrace},
    }, Runner.instantiateComputedArtifacts());

    const options = auditOptions;
    const settings = {throttlingMethod: 'simulate', throttling: {cpuSlowdownMultiplier: 3}};
    const output = await BootupTime.audit(artifacts, {options, settings});

    assert.equal(output.details.items.length, 7);
    assert.equal(output.score, 1);
    assert.equal(Math.round(output.rawValue), 464);

    assert.deepEqual(roundedValueOf(output, 'https://pwa.rocks/script.js'), {[groupIdToName.scripting]: 95.3, [groupIdToName.styleLayout]: 16.4, [groupIdToName.scriptParseCompile]: 3.9});
  });

  it('should get no data when no events are present', () => {
    const artifacts = Object.assign({
      traces: {
        [BootupTime.DEFAULT_PASS]: errorTrace,
      },
    }, Runner.instantiateComputedArtifacts());

    return BootupTime.audit(artifacts, {options: auditOptions})
      .then(output => {
        assert.equal(output.details.items.length, 0);
        assert.equal(output.score, 1);
        assert.equal(Math.round(output.rawValue), 0);
      });
  });
});
