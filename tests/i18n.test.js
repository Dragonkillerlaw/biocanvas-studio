import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {template, validateScene, emptyScene} from '../dist/core.js';
import {MODULES, MODULES_EN, searchAssets} from '../dist/agent-api.js';
import {ASSET_LABELS_EN, getAssetLabel, t, MESSAGES, localizeError} from '../dist/i18n.js';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'dist/assets/catalog.json'), 'utf8'));

test('asset paths are portable and preserve pinned artwork hashes', () => {
  const paths=new Set();
  for(const asset of catalog){
    const key=asset.src.toLowerCase();assert.ok(!paths.has(key),`Case collision: ${asset.src}`);paths.add(key);
    const data=fs.readFileSync(path.join(root,'dist',asset.src));
    if(asset.sha256)assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256,asset.id);
  }
});

test('validation messages are localized without changing arbitrary user text', () => {
  assert.equal(localizeError('Cannot open: 项目中有无效元素。','en'),'Cannot open: The project contains invalid elements.');
  assert.equal(localizeError('无法读取 SVG 文件。','en'),'Could not read the SVG file.');
  assert.equal(localizeError('User label 原文','en'),'User label 原文');
  assert.equal(localizeError('文字无效。','zh'),'文字无效。');
});

test('English and Chinese templates produce valid scenes and distinct titles', () => {
  const zhTrans = template('transformation', 'zh');
  const enTrans = template('transformation', 'en');
  const defTrans = template('transformation'); // default should be zh

  assert.equal(zhTrans.title, '细菌转化 · 实验流程');
  assert.equal(defTrans.title, '细菌转化 · 实验流程');
  assert.equal(enTrans.title, 'Bacterial Transformation · Workflow');

  assert.ok(validateScene(zhTrans));
  assert.ok(validateScene(enTrans));

  const zhPCR = template('pcr', 'zh');
  const enPCR = template('pcr', 'en');
  assert.equal(zhPCR.title, 'PCR 与凝胶分析');
  assert.equal(enPCR.title, 'PCR & Gel Analysis');
  assert.ok(validateScene(zhPCR));
  assert.ok(validateScene(enPCR));

  const zhBlank = template('blank', 'zh');
  const enBlank = template('blank', 'en');
  assert.equal(zhBlank.title, '未命名图稿');
  assert.equal(enBlank.title, 'Untitled Figure');
  assert.ok(validateScene(zhBlank));
  assert.ok(validateScene(enBlank));
});

test('English template step node labels are in English', () => {
  const enTrans = template('transformation', 'en');
  const assetNodes = enTrans.nodes.filter(n => n.type === 'asset');
  assert.equal(assetNodes.length, 6);
  assert.ok(assetNodes[0].label.includes('Plasmid DNA'));
  assert.ok(assetNodes[1].label.includes('Competent Cells'));
  assert.ok(assetNodes[2].label.includes('Transformation'));
  assert.ok(assetNodes[3].label.includes('Recovery'));
  assert.ok(assetNodes[4].label.includes('Plating'));
  assert.ok(assetNodes[5].label.includes('Colony Screening'));

  const enPCR = template('pcr', 'en');
  const pcrAssets = enPCR.nodes.filter(n => n.type === 'asset');
  assert.equal(pcrAssets.length, 4);
  assert.ok(pcrAssets[0].label.includes('Template DNA'));
  assert.ok(pcrAssets[1].label.includes('Reaction Setup'));
  assert.ok(pcrAssets[2].label.includes('PCR Amplification'));
  assert.ok(pcrAssets[3].label.includes('Gel Analysis'));
});

test('Catalog contains 59 assets with valid provenance and labelEn', () => {
  assert.equal(catalog.length, 59);
  for (const asset of catalog) {
    assert.ok(typeof asset.id === 'string' && asset.id.length > 0, `Asset ${asset.id} missing id`);
    assert.ok(typeof asset.name === 'string' && asset.name.length > 0, `Asset ${asset.id} missing name`);
    assert.ok(typeof asset.label === 'string' && asset.label.length > 0, `Asset ${asset.id} missing label`);
    assert.ok(typeof asset.labelEn === 'string' && asset.labelEn.length > 0, `Asset ${asset.id} missing labelEn`);
    assert.ok(typeof asset.author === 'string' && asset.author.length > 0, `Asset ${asset.id} missing author`);
    assert.ok(typeof asset.license === 'string' && asset.license.length > 0, `Asset ${asset.id} missing license`);
    assert.ok(typeof asset.src === 'string' && asset.src.startsWith('assets/'), `Asset ${asset.id} missing src`);
  }
});

test('Bilingual search matches both English and Chinese queries', () => {
  // English queries
  assert.ok(searchAssets(catalog, {query: 'pipette'}).total >= 2); // Pipette + pipette-tip-box
  assert.ok(searchAssets(catalog, {query: 'arabidopsis'}).total >= 2);
  assert.ok(searchAssets(catalog, {query: 'centrifuge'}).total >= 2);
  assert.ok(searchAssets(catalog, {query: 'spin column'}).total >= 1);
  assert.ok(searchAssets(catalog, {query: 'yeast'}).total >= 1);
  assert.ok(searchAssets(catalog, {query: 'shaker'}).total >= 1);

  // Chinese queries
  assert.ok(searchAssets(catalog, {query: '移液器'}).total >= 1);
  assert.ok(searchAssets(catalog, {query: '拟南芥'}).total >= 2);
  assert.ok(searchAssets(catalog, {query: '离心机'}).total >= 2);
  assert.ok(searchAssets(catalog, {query: '离心柱'}).total >= 1);
  assert.ok(searchAssets(catalog, {query: '酵母'}).total >= 1);
  assert.ok(searchAssets(catalog, {query: '摇床'}).total >= 1);
});

test('Course module definitions align between English and Chinese', () => {
  assert.equal(MODULES.length, MODULES_EN.length);
  const zhMap = new Map(MODULES);
  const enMap = new Map(MODULES_EN);
  for (const [id] of MODULES) {
    assert.ok(enMap.has(id), `Missing English module for ${id}`);
    assert.ok(zhMap.get(id).length > 0);
    assert.ok(enMap.get(id).length > 0);
  }
});

test('ASSET_LABELS_EN covers all 59 catalog assets', () => {
  for (const asset of catalog) {
    const enLabel = ASSET_LABELS_EN[asset.id];
    assert.ok(enLabel, `Missing ASSET_LABELS_EN for ${asset.id}`);
    assert.equal(getAssetLabel(asset, 'en'), asset.labelEn);
    assert.equal(getAssetLabel(asset, 'zh'), asset.label);
  }
});

test('Translation dictionary provides required messages with fallback', () => {
  assert.ok(MESSAGES.en);
  assert.ok(MESSAGES.zh);
  for (const key of Object.keys(MESSAGES.zh)) {
    assert.ok(MESSAGES.en[key] !== undefined, `Missing English translation for ${key}`);
    assert.equal(typeof t(key, 'en'), 'string');
    assert.equal(typeof t(key, 'zh'), 'string');
  }
  // Unknown key fallback
  assert.equal(t('nonexistent_key_xyz', 'en'), 'nonexistent_key_xyz');
});
