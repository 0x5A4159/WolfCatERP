async function check(username,user) {
    let truthuser = await user.exists({ userName: username });
    console.log(truthuser);
}

module.exports = {
    check: check
};