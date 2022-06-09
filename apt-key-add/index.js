const core = require('@actions/core');
const http = require('@actions/http-client')
const exec = require('@actions/exec');

const openpgp = require('openpgp');

const crypto = require('crypto');
const fs = require('fs'); 


const USER_AGENT = 'Apt-Key-Add (https://github.com/st3fan/actions/apt-key-add)';


// TODO This is not great. What is the node approved way? Or just use stdin?
const makeTemporaryPath = () => {
  return '/tmp/' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0);
};


const normalizeFingerprint = (fingerprint) => {
  return fingerprint.trim().replaceAll(' ', '').replaceAll(':', '').toLowerCase();
};


const validateFingerprint = (fingerprint) => {
  const re = /^[a-f0-9]{40}$/;
  return re.test(fingerprint);
};


const parseConfiguration = () => {
  const configuration = {
    keyUrl: core.getInput('key-url', {required: true}),
    keyFingerprint: normalizeFingerprint(core.getInput('key-fingerprint', {required: true})),
  };

  if (!validateFingerprint(configuration.keyFingerprint)) {
    throw Error('Invalid fingerprint input: must be 20 bytes hex.');
  }

  return configuration
};


const fetchKey = async (url) => {
  const client = new http.HttpClient();
  client.requestOptions = {headers: {'User-Agent': USER_AGENT}};
  const res = await client.get(url);
  return await res.readBody();
};


/**
 * Check if the given (armored) public key matches the fingerprint.
 */

const checkKey = async (armoredPublicKey, expectedFingerprint) => {
  const key = await openpgp.readKey({ armoredKey: armoredPublicKey});
  return key.getFingerprint() === expectedFingerprint
};


const addKey = async (armoredPublicKey) => {
  const path = makeTemporaryPath();
  fs.writeFileSync(path, armoredPublicKey);
  await exec.exec('sudo', ['apt-key', 'add', path]);
}


const main = async () => {
  try {
    const configuration = parseConfiguration();
    const armoredPublicKey = await fetchKey(configuration.keyUrl);
    await checkKey(armoredPublicKey, configuration.keyFingerprint);
    await addKey(armoredPublicKey);
  } catch (error) {
    core.setFailed(error.message);
  }
}


main();
