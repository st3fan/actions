const core = require('@actions/core');
const http = require('@actions/http-client')
const exec = require('@actions/exec');

const crypto = require('crypto');
const fs = require('fs'); 


// TODO This is not great. What is the node approved way?
const makeTemporaryPath = () => {
  return '/tmp/' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0)
    + '_' + crypto.randomBytes(4).readUInt32LE(0);
};


const parseConfiguration = () => {
  const configuration = {
    keyUrl: core.getInput("key-url"),
    keyData: core.getInput("key-data"),
  };

  if (configuration.keyUrl === "" && configuration.keyData === "") {
    throw Error(`Either key-url or key-data must be set.`);
  }

  return configuration
};


const USER_AGENT = 'Apt-Key-Add (https://github.com/st3fan/actions/apt-key-add)';


const fetchKey = async (url) => {
  const client = new http.HttpClient();
  client.requestOptions = {headers: {'User-Agent': USER_AGENT}};
  const res = await client.get(url);
  return await res.readBody();
};


const addKey = async ({ keyUrl, keyData }) => {
  if (keyUrl !== "") {
    keyData = await fetchKey(keyUrl);
  }

  const path = makeTemporaryPath();
  fs.writeFileSync(path, keyData);

  console.log("sudo", ["apt-key", "add", path]);
  await exec.exec("sudo", ["apt-key", "add", path]);
}


const main = async () => {
  try {
    const configuration = parseConfiguration();
    await addKey(configuration);
  } catch (error) {
    core.setFailed(error.message);
  }
}


main();
