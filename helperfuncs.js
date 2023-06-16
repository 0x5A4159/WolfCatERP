const os = require("os");

function getRandomKey() {
    const totalMemory = os.totalmem() - os.freemem();
    let curTime = Date.now() * totalMemory;
    const procVal = Object.values(process.memoryUsage());
    let RandVal = procVal[0] * curTime * procVal[1]
    RandVal = RandVal % (procVal[0] * procVal[3])
    return RandVal;
}

module.exports = getRandomKey;