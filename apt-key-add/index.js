const core = require('@actions/core');
const http = require('@actions/http-client')
const exec = require('@actions/exec');

const openpgp = require('openpgp');

const fs = require('fs');
const os = require('os');
const path = require('path');


const APT_TRUSTED_GPG_DIR = '/etc/apt/trusted.gpg.d';
const USER_AGENT = 'Apt-Key-Add (https://github.com/st3fan/actions/apt-key-add)';


/**
 * Turn a fingerprint in any kind of notation (12 34 / 12:34 / aa / AA) into a
 * simple hex string.
 */

const normalizeFingerprint = (fingerprint) => {
  return fingerprint.trim().replaceAll(' ', '').replaceAll(':', '').toLowerCase();
};


/**
 * Check if a normalized fingerprint is what we expect it to be. Returns true
 * if it is.
 */

const validateNormalizedFingerprint = (fingerprint) => {
  const re = /^[a-f0-9]{40}$/;
  return re.test(fingerprint);
};


/**
 * Check if the worker meets our requirements. Right now we only expect to have
 * a /etc/apt/trusted.gpg.d to write the public key to. Will throw an Error if
 * requirements are not met.
 */

const checkWorkerRequirements = () => {
  if (!fs.existsSync(APT_TRUSTED_GPG_DIR)) {
    throw Error(`Cannot run on this worker: ${APT_TRUSTED_GPG_DIR} does not exist.`);
  }
};


/**
 * Parse and validate the inputs. Will throw an error if the inputs are invalid.
 */

const parseConfiguration = () => {
  const configuration = {
    keyUrl: core.getInput('key-url', {required: true}),
    keyFingerprint: normalizeFingerprint(core.getInput('key-fingerprint', {required: true})),
  };

  if (!validateNormalizedFingerprint(configuration.keyFingerprint)) {
    throw Error('Invalid fingerprint input: must be 20 bytes hex.');
  }

  return configuration
};


/**
 * Fetch the key from the given URL.
 */

const fetchKey = async (url) => {
  const client = new http.HttpClient();
  client.requestOptions = {headers: {'User-Agent': USER_AGENT}};
  const res = await client.get(url);
  if (res.message.statusCode != 200) {
    throw Error(`Failed to fetch key: HTTP ${res.message.statusCode}`);
  }
  return await res.readBody();
};


/**
 * Check if the given (armored) public key matches the fingerprint. Throws an
 * Error if there is no match.
 */

const checkKey = async (armoredPublicKey, expectedFingerprint) => {
  const publicKey = await openpgp.readKey({ armoredKey: armoredPublicKey});
  if (publicKey.getFingerprint() !== expectedFingerprint) {
    throw Error(`Key validation failed: unexpected fingerprint.`);
  }
  return publicKey;
};


/**
 * Write the key to /etc/apt/trusted.gpg.d using the key id as the filename. We
 * can't write as root so we write it to a temporary directory first and then
 * sudo mv it to the right place.
 */

const writeKey = async (armoredPublicKey, publicKey) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apt-key-add-action-'));
  const keyName = `${publicKey.getKeyID().toHex()}.asc`;
  const keyPath = path.join(tmp, keyName);
  fs.writeFileSync(keyPath, armoredPublicKey);
  await exec.exec('sudo', ['mv', keyPath, path.join(APT_TRUSTED_GPG_DIR, keyName)]);
}


/**
 * Main entry point.
 */

const main = async () => {
  try {
    checkWorkerRequirements();
    const configuration = parseConfiguration();
    const armoredPublicKey = await fetchKey(configuration.keyUrl);
    const publicKey = await checkKey(armoredPublicKey, configuration.keyFingerprint);
    await writeKey(armoredPublicKey, publicKey);
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
