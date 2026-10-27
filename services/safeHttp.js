const dns = require('dns').promises;
const net = require('net');
const axios = require('axios');
const ipaddr = require('ipaddr.js');
const config = require('../config');

function isPrivateAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.range() !== 'unicast';
  } catch (_) {
    return true;
  }
}

async function validateOutboundUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  if (!value) throw new Error('目标 URL 不能为空');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error('目标 URL 格式无效');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅允许 HTTP/HTTPS 目标');
  }
  if (parsed.protocol === 'http:' && !config.outboundAllowHttp) {
    throw new Error('仅允许 HTTPS 目标');
  }
  if (parsed.username || parsed.password) {
    throw new Error('目标 URL 不允许包含账号密码');
  }
  if (
    parsed.port &&
    !['80', '443'].includes(parsed.port) &&
    !config.outboundAllowPrivate
  ) {
    throw new Error('目标 URL 端口不受支持');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname.length > 253) {
    throw new Error('目标主机名无效');
  }
  let records;
  if (net.isIP(hostname)) {
    records = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  }
  if (!records.length) throw new Error('目标域名无法解析');
  if (!config.outboundAllowPrivate && records.some(record => isPrivateAddress(record.address))) {
    throw new Error('目标地址不允许指向内网、回环或保留地址');
  }

  parsed.hash = '';
  return {
    url: parsed.toString(),
    hostname,
    addresses: records
  };
}

function lookupFrom(addresses) {
  return (hostname, options, callback) => {
    const opts = typeof options === 'object' && options ? options : {};
    const family = typeof options === 'number' ? options : opts.family;
    const candidates = addresses.filter(item => !family || item.family === family);
    const selected = candidates[0] || addresses[0];
    if (!selected) {
      callback(new Error('No safe DNS result'));
      return;
    }
    if (opts.all) {
      callback(null, candidates.length ? candidates : addresses);
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

async function safeRequest(options) {
  const target = await validateOutboundUrl(options.url);
  return axios.request({
    ...options,
    url: target.url,
    maxRedirects: 0,
    maxContentLength: options.maxContentLength || 2 * 1024 * 1024,
    maxBodyLength: options.maxBodyLength || 1024 * 1024,
    timeout: options.timeout || 15000,
    proxy: false,
    lookup: lookupFrom(target.addresses)
  });
}

function safeGet(url, options = {}) {
  return safeRequest({ ...options, url, method: 'GET' });
}

function safePost(url, data, options = {}) {
  return safeRequest({ ...options, url, data, method: 'POST' });
}

function safePut(url, data, options = {}) {
  return safeRequest({ ...options, url, data, method: 'PUT' });
}

function safeDelete(url, options = {}) {
  return safeRequest({ ...options, url, method: 'DELETE' });
}

module.exports = {
  validateOutboundUrl,
  safeRequest,
  safeGet,
  safePost,
  safePut,
  safeDelete
};
