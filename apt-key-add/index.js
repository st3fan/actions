const core = require('@actions/core');
const http = require('@actions/http-client')
const exec = require('@actions/exec');

const crypto = require('crypto');
const fs = require('fs'); 


const USER_AGENT = 'Apt-Key-Add (https://github.com/st3fan/actions/apt-key-add)';


// TODO This is not great. What is the node approved way?
const makeTemporaryPath = () => {
  return '/tmp/' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0);
};


const parseConfiguration = () => {
  const configuration = {
    keyUrl: core.getInput('key-url'),
    keyData: core.getInput('key-data'),
    expectedKeyFingerprint: core.getInput('expected-key-fingerprint'),
  };

  if (configuration.keyUrl === '' && configuration.keyData === '') {
    throw Error(`Either key-url or key-data must be set.`);
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
 * Parse the output of `gpg --show-keys --with-fingerprint` and
 * look for key fingerprints.
 *
 * This is not a perfect parser and it would also for example match
 * a fingerprint stored on the uid line.
 *
 * We accept that for now and let checkKeyFingerprint fail if the
 * output contains more than one fingerprint for whatever reason.
 */

const parseShowKeysWithFingerprint = (output) => {
  const re = /Key fingerprint = ([A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4}  [A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4} [A-F0-9]{4})/g;
  return [...output.matchAll(re)].map((m) => { return m[1] });
};


/**
 * Remove all spaces from a fingerprint.
 */

const normalizeFingerprint = (fingerprint) => {
  return fingerprint.replaceAll(' ', '');
};


/**
 * Check if the given (armored) key contains the fingerprint. An
 * exception is raised when there are unexpected results or when
 * the expected fingerprint cannot be found.
 */

const checkKeyFingerprint = async (armoredKeyPath, expectedFingerprint) => {
  let output = '';
  const options = {
    silent: true,
    listeners: {
      stdout: (data) => { output += data.toString() }
    }
  };
  await exec.exec('gpg', ['--show-keys', '--with-fingerprint', armoredKeyPath], options);
  const fingerprints = parseShowKeysWithFingerprint(output);
  if (fingerprints.length !== 1) {
    throw new Error('Fingerprint check error; not exactly 1 fingerprint found');
  }
  if (normalizeFingerprint(fingerprints[0]) !== normalizeFingerprint(expectedFingerprint)) {
    throw new Error('Fingerprint check error; did not find expected fingerprint');
  }
};


const addKey = async ({ keyUrl, keyData, expectedKeyFingerprint }) => {
  if (keyUrl !== '') {
    keyData = await fetchKey(keyUrl);
  }

  const path = makeTemporaryPath();
  fs.writeFileSync(path, keyData);

  if (expectedKeyFingerprint !== '') {
    checkKeyFingerprint(path, expectedKeyFingerprint);
  }

  //console.log('DEBUG', 'sudo', ['apt-key', 'add', path]);
  await exec.exec('sudo', ['apt-key', 'add', path]);
}


const main = async () => {
  try {
    const configuration = parseConfiguration();
    await addKey(configuration);
  } catch (error) {
    console.log("CATCHING", error); // TODO This doesn't work - is it the async stuff?
    core.setFailed(error.message);
  }
}

main();

