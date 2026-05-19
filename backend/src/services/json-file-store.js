const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const fileLocks = new Map();

function cloneDefaultValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeFilePath(filePath) {
  return path.resolve(filePath);
}

async function withFileLock(filePath, task) {
  const lockKey = normalizeFilePath(filePath);
  const previous = fileLocks.get(lockKey) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (fileLocks.get(lockKey) === current) {
        fileLocks.delete(lockKey);
      }
    });

  fileLocks.set(lockKey, current);
  return current;
}

async function readJsonFile(filePath, defaultValue) {
  try {
    let data = await fs.readFile(filePath, 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.slice(1);
    }
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT' && arguments.length >= 2) {
      return cloneDefaultValue(defaultValue);
    }
    throw error;
  }
}

async function writeJsonFileAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tempFilePath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );

  const json = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tempFilePath, json, 'utf8');
  await fs.rename(tempFilePath, filePath);
}

async function updateJsonFile(filePath, defaultValue, updater) {
  return withFileLock(filePath, async () => {
    const currentValue = await readJsonFile(filePath, defaultValue);
    const nextValue = await updater(currentValue);
    await writeJsonFileAtomic(filePath, nextValue);
    return nextValue;
  });
}

module.exports = {
  readJsonFile,
  writeJsonFileAtomic,
  updateJsonFile,
  withFileLock,
};
