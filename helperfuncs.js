const os = require("os");

function modPow(b, e, m) { // modular exponentiation function to help generate pseudorandom numbers.
    if (m === 1) {
        return 0
    } else {
        let acc = 1n;
        b = b % m;
        while (e > 0) {
            if (e % 2n == 1n) {
                acc = (acc * b) % m;
            }
            b = (b * b) % m;
            e = e >> 1n;
        }
        return acc;
    }
}

function genRandKey() { // uses the modular exponentiation function along with potentially random values to help produce an unpredictable number
    const bigLimit = BigInt("9".repeat(128)); // limit for modulus, 128bit key
    const memoryUsed = os.totalmem() - os.freemem();
    const curTime = Date.now();
    const large_value = BigInt(memoryUsed * curTime)
    let newRand = modPow(13n, large_value, bigLimit);

    if (newRand.toString().length !== 128) { // add 1 to pad for 128 length
        newRand = BigInt(newRand += "1".repeat(128 - newRand.toString().length));
    }

    return newRand.toString(16); // hex value of key
}

module.exports = genRandKey;