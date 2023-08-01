const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
const task = require('./models/tasks');
const net = require('net');
const fs = require('fs');
const https = require('https');
const app = express();
const bcrypt = require('bcryptjs');
const genRandKey = require('./helperfuncs');
const cookieParser = require('cookie-parser');
let userStat = {}; // empty object which gets appended with user ip and their requests for last X seconds according to timer at end of page

// initialize view engine and load env variables and needed files
app.set('view engine', 'ejs');
serverport = process.env.SERVERPORT;
serverip = process.env.SERVERIPADDR;
const key = fs.readFileSync('./rsa/localhost.key');
const cert = fs.readFileSync('./rsa/localhost.crt');
const default_avatar = fs.readFileSync('./useraviencode.txt');
const ONE_MONTH = 1000 * 60 * 60 * 24 * 30;

const testing_cases = false;

const USER_ROLES = new Map([ // mapping numeric roles to role-names
    [0, 'Admin'],
    [1, 'Moderator'],
    [2, 'User'],
    [3, 'Disabled']
]);

const server = https.createServer({
    key: key,
    cert: cert
}, app);

// Loading mongodb assets
mongoose.connect('mongodb://127.0.0.1:27017/appdb')
    .then((result) => {
        console.log("DB connect on localhost:27017");
        server.listen(serverport, serverip);
    })
    .catch((err) => console.log("Failed connect"));


// Cycling log to guarantee it exists when we call getSettings
cycleLog("Initializing start-up log cycle.");

var settings = {};
var recentTimer = dynamicSettings();

app.use(express.json({limit:'10mb'}))

app.use(express.static('static'));

app.use(cookieParser());

app.use((req, res, next) => { // helps to handle whether or not user is signed in to avoid depicting unneccessary sign in postage.
    res.locals.userIsSignedIn = typeof req.cookies.USER === 'undefined';
    res.locals.userNameHeader = capitalizeWord(req.cookies.USER);
    next();
})

const validAuthDate = async (SID) => { // checks to see if a session id is older than the expire date
    const sessionUserObj = await user.findOne({ "userSession.sessionID": SID });
    return sessionUserObj;
}

const isAuth = async (req, res, next) => {
    const userSessionID = req.cookies.SID;

    if (typeof userSessionID !== 'undefined') { // if cookie sid is not empty 
        const userSessionObject = await validAuthDate(userSessionID);
        if (userSessionObject !== null) { // if there's a valid session
            if (userSessionObject.userSession.expireDate > Date.now()) { // check to see if it's got a valid expiration date comparison
                next();
            }
            else { // clear cookies from client side and set user's session id to nothing in mongo
                res.clearCookie('SID');
                res.clearCookie('USER');
                userSessionObject.userSession = {};
                userSessionObject.save();
                res.redirect('/');
            }
        }
        else {
            res.clearCookie('SID');
            res.clearCookie('USER');
            res.redirect('/'); // if no user found just kick to index
        }
    }
    else { // if there's a cookie no cookie, send to the signup page
        res.redirect('/signup');
    }
};

if (testing_cases) {
    app.use((req, _, next) => {
        console.log("Body: ", req.body);
        console.log("Headers: ", req.headers);
        next();
    });
}


app.use((req, res, next) => {
    if (settings.apiLimit) {
        if (req.method === 'POST') {
            userRequest = req.protocol + '://' + req.get('host') + req.originalUrl;
            if (typeof userStat[req.socket.remoteAddress] !== "undefined") {
                if (typeof userStat[req.socket.remoteAddress][userRequest] !== "undefined") {
                    userStat[req.socket.remoteAddress][userRequest] += 1;
                }
                else {
                    userStat[req.socket.remoteAddress][userRequest] = 1;
                };
            }
            else {
                userStat[req.socket.remoteAddress] = { [userRequest]: 0 }
            }
            if (userStat[req.socket.remoteAddress][userRequest] < settings.apiMax) {
                next();
            }
            else {
                res.json({ 'success': false, 'message': "API max reached, try again later." });
            }
        }
        else {
            next();
        }
    }
});


// Basic website pages, login and home =======================================================================================================
app.get("/", (req, res) => {
    res.render('index');
});

app.get("/home", (_, res) => {
    res.redirect("/");
});

app.get("/index", (_, res) => {
    res.redirect("/");
});

app.get("/signin", (req, res) => {
    if (typeof req.cookies.SID !== 'undefined') {
        res.redirect('/')
    }
    else {
        res.render('signin');
    }
});

app.get("/signup", (req, res) => {
    if (typeof req.cookies.SID !== 'undefined') {
        res.redirect('/');
    }
    else {
        res.render('signup');
    }
});

// users section ==============================================================================================================================

app.get("/users/:userid", (req, res) => {
    const userId = req.params.userid;
    user.findOne({ 'userName': userId.toLowerCase() })
        .then((result) => {
            res.render('userIndividual', {
                userName: capitalizeWord(result.userName),
                userRole: USER_ROLES.get(result.userRole),
                userCreated: result.userCreated,
                userAvatar: typeof result.userAvatar !== "undefined" & result.userAvatar !== "" ? result.userAvatar : default_avatar,
                userStatus: typeof result.userStatus !== 'undefined' & result.userStatus !== "" ? result.userStatus : "Feeling Lucky",
                userPronouns: typeof result.userStatus !== 'undefined' & result.userPronouns !== "" ? result.userPronouns : "Place/Holder",
                userActual: result.userSession.sessionID === req.cookies.SID // comparing if the user viewing the page matches the user being viewed
            });
        })
        .catch((error) => {
            res.redirect('/404');
        });
});

app.get('/users', (req, res) => {
    user.find({})
        .then((result) => {
            res.render('users', {result});
        })
})

app.post('/api/uploadAvatar', async (req, res) => {
    try { // if receiving a malformed b64 object
        const imgAsBuffer = Buffer.from(req.body.userImage, 'base64');
        if (imgAsBuffer.byteLength <= 300000) { // no 256x256 image should be this large
            if (pngCheck(imgAsBuffer) || jpgCheck(imgAsBuffer)) {
                await user.updateOne({ 'userSession.sessionID': req.cookies.SID }, { 'userAvatar': imgAsBuffer.toString('base64') });
                res.status(200).json({ "success": true });
            }
        }
        else {
            res.json({ "success": false, "message": "File Too Large!" });
        }
    }
    catch (error) {
        console.log(`${req.socket.remoteAddress} Made bad API request: ${error}`);
        res.status(500).json({"success": false, "message": "Didn't receive proper values."})
    }

});

app.post('/api/changePronoun', async (req, res) => {
    if (req.body.userPronoun !== null) {
        if (req.body.userPronoun.length < 12) {
            if (req.body.userPronoun.includes("/")) {
                await user.updateOne({ 'userSession.sessionID': req.cookies.SID }, { 'userPronouns': req.body.userPronoun });
                res.status(200).json({ "success": true });
            }
            else {  // no slash in pronouns
                res.status(400).json({ "success": false, "message": "Pronouns missing a slash" })
            }
        }
        else {  // pronouns exceed 12 char
            res.status(400).json({ "success": false, "message": "Pronouns too long" });
        }
    }
    else { // pronouns empty
        res.status(400).json({ "success": false, "message": "Missing pronouns" });
    }
});

app.post('/api/changeStatus', async (req, res) => {
    if (req.body.userPronoun !== null) {
        if (req.body.userStatus.length < 70) { // 70 characters is about how much it takes to wrap twice at 1920x1080
            await user.updateOne({ 'userSession.sessionID': req.cookies.SID }, { 'userStatus': req.body.userStatus });
            res.status(200).json({ 'success': true });
        }
        else { // too long
            res.status(400).json({ 'success': false, 'message': 'Status too long, 70 characters max.' });
        }
    }
    else { // no info at all
        res.status(400).json({ "success": false, "message": "Missing status information." });
    }
});

// Tasks section ===============================================================================================================================

app.get("/tasks", isAuth, (req, res) => {
    task.find({ complete: false })
        .then((result) => {
            res.render('tasks', {
                tasks: result,
                user: capitalizeWord(req.cookies.USER)
            });
        })
        .catch((error) => {
            console.log('Failed load tasks to /tasks/', error);
        });
});

app.get("/tasks/id/:urlid", (req, res) => {
    const id_to_find = req.params.urlid;
    task.findById(id_to_find).then((result) => {
        res.render('individual_task', {
            task: result,
            user: capitalizeWord(req.cookies.USER)
        });
    })
    .catch((error) => {
        console.log(error);
        res.redirect('404');
    });
});

app.get("/tasks/id/:urlid/edit", (req, res) => {
    const id_to_find = req.params.urlid;
    task.findById(id_to_find).then((result) => {
        res.render('individual_task_edit', {
            task: result,
            user: capitalizeWord(req.cookies.USER)
        });
    })
        .catch((error) => {
            console.log(error);
            res.redirect('404');
        });
});

app.get("/tasks/history", (req, res) => {
    if (!isNaN(req.query.pagenum) && req.query.pagenum >= 0) {
        task.find({ complete: true }).sort('createdate').limit(5).skip(req.query.pagenum * 5).then((result) => {
            task.countDocuments({ complete: true }).then((documentCount) => {
                res.render('task_history', {
                    tasks: result,
                    user: capitalizeWord(req.cookies.USER),
                    total: documentCount,
                    curPage: parseInt(req.query.pagenum)
                });
            });
        })
            .catch((error) => {
                console.log(error);
                res.redirect('/404')
            })
    }
    else {
        res.redirect('/tasks/history?pagenum=0');
    }
});

app.get("/tasks/api/fetchAll", (_, res) => {
    task.find({ complete: false })
        .then((result) => {
            res.send(result);
        })
        .catch((error) => {
            console.log('Failed understand fetchAll request', error);
        });
});

app.post('/tasks/api/editTask', async (req, res) => {
    createdByUser = user.findOne({ 'userSession.sessionID': req.cookies.SID }).then(async (sessionUserVal) => {
        if (req.body.title !== "") {
            await task.updateOne({ _id: req.body.taskid }
                ,
                {
                    '$set': {
                        'title': req.body.title,
                        'description': req.body.description === "" ? "None" : req.body.description,
                        'lastEdited': capitalizeWord(sessionUserVal.userName)
                    }
                }
            );

            addLog(`User ${capitalizeWord(sessionUserVal.userName)} edited task.`);

            res.status(200).json({
                'success': true,
                'message': 'Updated existing task'
            });
        }
        else {
            res.status(404).json({ 'success': false, 'message': 'Task must have a name' });
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).send({ "success": false, "message": "Couldn't create task." });
    });
});

app.post('/tasks/api/delOne', (req, res) => {
    try {
        task.findById(req.body.popid).then(async (result) => {
            if (result) {
                if (result.onlyCreator) {
                    user.findOne({ userName: result.createdby.toLowerCase() }).then(async (userResult) => {
                        user.findOne({ "userSession.sessionID": req.cookies.SID }).then(async (deleterResult) => {
                            if (userResult.userSession.sessionID === req.cookies.SID || userResult.userRole > deleterResult.userRole) {
                                result.complete = true
                                await result.save();
                                res.status(200).json({ success: true });
                            }
                            else {
                                res.status(403).json({ success: false, message: "Not the creator of this task" });
                            }
                        }).catch((err) => { res.status(500).json({ success: false }) });
                    }).catch((err) => { res.status(500).json({ success: false }) });
                }
                else {
                    result.complete = true
                    await result.save()
                    res.status(200).json({ success: true });
                }
            }
            else {
                res.status(403).json({ success: false });
            }
        })
            .catch((error) => {
                console.log(error);
            })
    }
    catch {
        res.status(500).json({ success: false });
    }
});

app.post('/tasks/api/addOne', (req, res) => {
    const userTitle = req.body.title;
    let userDesc = req.body.description.length === 0 ? "No description" : req.body.description;

    try {
        successcreatedate = Date.now()
        createdByUser = user.findOne({ 'userSession.sessionID': req.cookies.SID }).then((sessionUserVal) => {
            task.create({ // create the task under the name of whoever matches the session id in their cookies
                title: userTitle,
                description: userDesc.length === 0 ? "No description" : userDesc,
                complete: false,
                createdate: successcreatedate,
                createdby: capitalizeWord(sessionUserVal.userName),
                onlyCreator: req.body.onlyCreator,
                lastEdited: "None"
            }).then((result) => {
                res.status(200).send({
                    "success": true,
                    "id": result._id,
                    "createdate": successcreatedate,
                    "createdby": capitalizeWord(sessionUserVal.userName)
                });
            });
        }).catch((err) => {
            console.log(err);
            res.status(500).send({ "success": false, "message": "Couldn't create task." });
        });

    }
    catch (err) {
        console.log(err);
        res.status(500).send({ "success": false, "id": "0" });
    }
});

// RUSTAPP LOCAL REVERSE PROXY SERVER

app.get("/rustapp", (req, res) => { // this reaches out to an API hosted on a RustLang binary TCP websocket
    let tcpClient = new net.Socket();
    const startTime = performance.now();
        tcpClient.connect(12500, '127.0.0.1', () => {
            console.log('made a link to rustApp');
        });
        tcpClient.on('data', (data) => {
            res.send(data.toString());
        });
        tcpClient.on('close', () => {
            const endTime = performance.now();
            console.log(`rustapp perf time: ${endTime - startTime}`);
        });
        tcpClient.on('error', (err) => {
            console.log("tcpClient for rustApp failed, check logs for more info");
            addLog(`Failed to fulfil request for rustapp due to error: ${err}`);
            res.status(503).json({ 'success': false, 'message': 'Failed initialize for rustapp' });
        })
    }
);

const isAdmin = async (request) => {
    isLocalHost = request.socket.remoteAddress === process.env.SERVERIPADDR;
    const creatorFind = await user.findOne({ 'userSession.sessionID': request.cookies.SID });
    try {
        isCreator = (creatorFind).userRole === 0;
    }
    catch {
        return false;
    }
    return [isLocalHost, isCreator].every(Boolean);
}

app.get("/admin/stats", async (req, res) => {
    if (await isAdmin(req)) {
        res.send({ "userStat": userStat, "session": req.cookies });
    }
    else {
        res.send({ "success": false });
    }
});

app.get("/admin/funcs", async (req, res) => {
    if (settings.funcPage) {
        if (await isAdmin(req)) {
            res.render('adminfuncs');
        }
        else {
            res.json({ "success": false })
        }
    }
    else {
        res.json({"success": false, "message": "FuncPage disabled in settings."})
    }
})


app.post("/admin/funcs", async (req, res) => {
    if (settings.funcPage) {
        if (await isAdmin(req)) {
            const funcParam = req.body.funcParam;
            switch (req.body.funcName) {
                case 'delManyTasks':
                    if (funcParam !== '') {
                        try {
                            jsonVal = JSON.parse(funcParam);
                            await task.deleteMany(jsonVal);

                            user.findOne({ "userSession.sessionID": req.cookies.SID }).then((e) => {
                                addLog(`Tasks with values ${JSON.stringify(jsonVal)} were deleted by ${e.userName}`);
                            }).catch((err) => { console.log (err)})

                            res.json({ "success": true, "message": "called func successfully" });
                        }
                        catch {
                            res.json({ "success": false, "message": "Bad formatting on parameters" })
                        }

                    }
                    else {
                        res.json({ "success": false, "message": "parameters were empty." });
                    }
                    break;

                case 'completeAll':
                    await task.updateMany({}, { '$set': { 'complete': true } });

                    user.findOne({ "userSession.sessionID": req.cookies.SID }).then((e) => {
                        addLog(`All open tasks completed by ${e.userName}`);
                    }).catch((err) => { console.log(err) })

                    res.json({ "success": true, "message": "Completed all tasks" });
                    break;

                case 'updateUser':
                    try {
                        let userChange = JSON.parse(funcParam);
                        await user.updateMany({ userName: userChange.user }, { '$set': userChange.updates });

                        user.findOne({ "userSession.sessionID": req.cookies.SID }).then((e) => {
                            addLog(`${e.userName} updated user ${userChange.user} with new values ${JSON.stringify(userChange.updates)}`);
                        }).catch((err) => { console.log(err) });

                        res.json({ "success": true, "message": "user updated with new settings" });
                    }
                    catch (err) {
                        res.json({ "success": false, "message": `user wasn't able to be updated for reason: ${err}` });
                    }
                    break;

                case 'logoutUser':
                    if (funcParam !== '') {
                        user.findOne({ userName: funcParam.toLowerCase() }).then((result) => {
                            result.userSession = {};
                            result.save();

                            user.findOne({ "userSession.sessionID": req.cookies.SID }).then((e) => {
                                addLog(`${result.userName} was forcefully signed out by ${e.userName}`);
                            }).catch((err) => { console.log(err) });

                            res.json({ "success": true, "message": "logged out user successfully" });
                        }).catch((err) => {
                            res.json({ "success": false, "message": "couldn't find user" });
                        })
                    }
                    else {
                        res.json({ "success": false, "message": "Need to provide a parameter" })
                    }
                    break;

                case 'cycleLog':
                    user.findOne({ "userSession.sessionID": req.cookies.SID }).then(async (e) => {
                        await addLog(`${e.userName} initiated cycling logs`);
                        retvalue = await cycleLog();
                        if (typeof retvalue !== 'undefined') {
                            addLog(`${e.userName} cycled logs, ${retvalue}`);
                            res.json({ "success": true, "message": `${retvalue}` });
                        }
                        else {
                            res.json({ "success": false, "message": `Issue cycling log, value for return is ${retvalue}` })
                        }
                        
                    }).catch((err) => { console.log(err) });
                    break;

                case 'AutoCycle':
                    if (funcParam.toLowerCase() === 'on') {

                    }
                    else if (funcParam.toLowerCase() === 'off') {

                    }
                    break;

                case 'updateSettings':
                    clearTimeout(recentTimer);
                    recentTimer = await dynamicSettings();
                    if (typeof recentTimer !== 'undefined') {

                        user.findOne({ "userSession.sessionID": req.cookies.SID }).then((e) => {
                            addLog(`${e.userName} updated server settings`);
                        }).catch((err) => { console.log(err) });

                        res.json({ 'success': true, "message": `Updated settings, now: ${JSON.stringify(settings)}` });
                    }
                    else {
                        res.json({ 'success': false, 'message': 'Couldnt update settings' });
                    }
                    break;

                default:
                    if (!res.headersSent) {
                        res.json({ 'success': false, 'message': 'no known command' });
                    }
                    else {

                    }
            }
        }
        else {
            res.json({'success': false, 'message': 'failed to verify admin stat.'})
            console.log('failed');
        }
    }
    else {
        res.json({'success': false, 'message':'Settings do not allow for funcPage usage.'})
    }
});

app.post("/signup", async (req, res) => {
    if (passwordValidator(req.body.userPass)) {
        if (emailValidator(req.body.userEmail)) {

            let isUserExist = await user.findOne({ userEmail: req.body.userEmail.toLowerCase() });

            let latestUser = await user.find().sort({ userID: -1 }).limit(1); // will use this to generate new max user id

            const maxUserID = typeof latestUser[0] === "undefined" ? 0 : latestUser[0].userID;

            if (isUserExist === null) {
                const hashedPass = await bcrypt.hash(req.body.userPass, 10);
                const secretToken = genRandKey(128);
                const expireDateCalc = new Date(Date.now() + ONE_MONTH);
                await user.create({
                    userName: req.body.userName.toLowerCase(),
                    userEmail: req.body.userEmail.toLowerCase(),
                    userPass: hashedPass,
                    userRole: 2, // Default user role to User (2)
                    userID: maxUserID + 1,
                    userSession: { sessionID: secretToken, expireDate: expireDateCalc }, // assign session on signin, good for 1month
                    userCreated: Date.now(),
                    userAvatar: ""
                }).then((result) => {
                    res.cookie('SID', secretToken, { expires: expireDateCalc});
                    res.cookie('USER', req.body.userName, { expires: expireDateCalc});
                    result.save();
                    res.status(201).send({ "success": true });
                }).catch((err) => {
                    res.status(500).send({ "success": false });
                });
            }
            else { // if user already exists
                res.send({ "success": false, "message": "Email already in use" });
            }
        }
        else { // if email doesnt match regex
            res.send({ "success": false, "message": "Issue with Email provided."});
        }
    }
    else { // if password doesnt match criteria
        res.send({ "success": false, "message": "Issue with password provided."});
    }
});


app.post("/signin", async (req, res) => {
    await user.findOne({ "userName": req.body.userName.toLowerCase() }).then(async (userObj) => {
        if (userObj !== null) {
            const passMatch = await bcrypt.compare(req.body.userPass, userObj.userPass);
            if (passMatch) {
                const secretToken = genRandKey(128);
                const expireDateCalc = new Date(Date.now() + ONE_MONTH);
                res.cookie('SID', secretToken, { expires: expireDateCalc });
                res.cookie('USER', req.body.userName, { expires: expireDateCalc });
                userObj.userSession = { sessionID: secretToken, expireDate: expireDateCalc };
                userObj.save();
                res.status(200).send({ "success": true, "message": "Successfully signed in." });
            }
            else {
                res.status(404).send({ "success": false, "message": "Incorrect sign-in info." });
            }
        }
        else {
            res.status(404).send({ 'success': false, 'message': "Incorrect sign-in info." });
        }
    })
})

app.use((req, res) => {
    res.status(404).render('404');
});

// regex validity checkers

function passwordValidator(password) {
    hasUpper = /[A-Z]/.test(password);
    hasLower = /[a-z]/.test(password);
    hasNumeric = /[0-9]/.test(password);
    hasSpecial = /[(\!|\@|\#|\$|\%|\^|\&|\*|\(|\)|\,|\.|\/|\?|\:|\;|\'|\"|\[|\{|\]|\}|\\|\||\<|\>|\-|\_|\+|\=)]/.test(password);
    hasLength = password.length >= 8;
    return [hasUpper, hasLower, hasNumeric, hasSpecial, hasLength].every(Boolean);
}

function emailValidator(email) {
    emailDomain = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
    return emailDomain
}


// QoL upper casing:
function capitalizeWord(string) {
    if (typeof string === 'undefined') {
        return undefined;
    }
    return string[0].toUpperCase() + string.slice(1);
};

// reset userstat every X seconds to help with limiting API usage and keeping track of user requests

const userStatInterval = setInterval(() => {
    userStat = {};
}, 5_000);

const checkStat = setInterval(() => { // does a slight delay and checks if settings match, if it does it drops the interval for settings
    if (!(settings.apiLimit) && typeof settings.apiLimit !== 'undefined') {
        clearInterval(checkStat);
        clearInterval(userStatInterval);
    }
},5_000);

// Image processing

const pngCheck = (buffer) => { // png starts with 8 byte tag.
    if (!buffer || buffer.length < 8) {
        return false; // cant be a png if it's too short to include png tag
    }
    else { // checks for the png tag at the first 8 bytes of image, and pushes it to a buffer so it can be compared withe image buffer
        return buffer.slice(0, 8).toString() === Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).slice(0, 8).toString();
    }
}

const jpgCheck = (buffer) => { // checking jpg matches two start and end bytes for jpg raw byte configuration
    if (!buffer || buffer.length < 4) {
        return false;
    }
    else {
        const soi = buffer.slice(0, 2); // jpg starts with 2 specific bytes
        const eoi = buffer.slice(-2); // and ends with 2 other specific bytes
        const byteresults = [
            soi.toString() === Buffer.from([0xff, 0xd8]).toString(),
            eoi.toString() === Buffer.from([0xff, 0xd9]).toString()
        ];
        return byteresults.every(Boolean); // if both conditions match return true else false
    }
}

// Should it be necessary, a binary search alg

const binSearch = (arr, val) => {
    let low = 0;
    let high = arr.length - 1;

    while (low <= high) {
        let mid = Math.floor((low + high) / 2);

        if (arr[mid] === val) {
            return mid;
        }

        if (val < arr[mid]) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    return -1; // default case
}

// logging and settings

function addLog (msg) { // getmonth returns a 0 indexed value for SOME reason
    dateval = new Date();
    formatdate = `${dateval.getMonth() + 1}/${dateval.getDate()}/${dateval.getFullYear()} @ ${dateval.getHours()}:${dateval.getMinutes()}:${dateval.getSeconds()}`;
    dated_msg = `${formatdate} - ${msg}\n`;
    fs.appendFile('data.log', dated_msg, (err) => {
        if (err) throw err;
    });
}

function cycleLog () {
    dateval = new Date()
    formatdate = `${dateval.getMonth() + 1}-${dateval.getDate()}-${dateval.getFullYear()}-${dateval.getHours()}-${dateval.getMinutes()}`;
    if (fs.existsSync('./data.log')) {
        fs.renameSync('./data.log', `./log_archive/data-${formatdate}.log`);
        fs.writeFileSync('./data.log', '');
        return `Copied data.log for ${formatdate}`;
    }
    else {
        fs.writeFileSync('./data.log', '');
        return `Created data.log as it was missing, no data.log to cycle.`
    }
}

function getSettings(callReason) {
    return new Promise((resolve) => {
        addLog(`Called getSettings for reason: ${callReason}.`);
        if (fs.existsSync('./settings.cfg')) {
            settings_file = fs.readFile('./settings.cfg', 'utf-8', (err, data) => {
                if (err) {
                    return;
                }
                else {
                    var jsonData = {};
                    const split_values = data.replace('\r', '').split('\n');
                    split_values.forEach((column) => {
                        split_internal = column.split(':');
                        jsonData[split_internal[0]] = split_internal[1].toLowerCase() === 'true' ? true : split_internal[1].toLowerCase() === 'false' ? false : split_internal[1];
                    });
                    settings = jsonData;
                    resolve();
                }
            });
        }
    });
}

async function dynamicSettings() {
    await getSettings('Called by dynamicSetting auto-updater')
    const recentTimerID = await setTimeout(dynamicSettings, 'cycleTime' in settings ? settings.cycleTime * 1000 : 60 * 60 * 60 * 1000);
    return recentTimerID;
    };

// Test cases =======================================================================================================================================

if (testing_cases) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0; // for simple internal https testing

    total_paths = []
    app._router.stack.forEach((r) => {
        if (r.route && r.route.path) {
            total_paths.push(r.route.path)
        }
    });

    if (total_paths.length > 0) { // testing generic get for every available path
        total_paths.forEach((path) => {
            try {
                https.get(`https://${serverip}:${serverport}${path}`, (response) => {
                    console.log('Running get for ', `${serverip}:${serverport}${path}`)
                    response.on('end', () => {
                        console.log('Finished on ', path, response.statusCode);
                    });
                }).on('error', (err) => {
                    console.log('error on path ', path, err.message);
                });
            }
            catch (err) {
                console.log('get error on ', path, err);
            }
        });

        total_paths.forEach((path) => { // empty post for every path
            options = {
                hostname: serverip,
                port: 443,
                'path': path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': 0
                }
            }

            try {
                console.log('Running post for ', `${serverip}:${serverport}${path}`)
                https.request(options, (response) => {
                    response.on('end', () => {
                        console.log('Finished on ', path, response.statusCode);
                    });
                }).on('error', (err) => {
                    console.log('error on path ', path, err.message);
                });
            }
            catch (err) {
                console.log('get error on ', path, err);
            }

            user.find({})
                .then((result) => {
                    console.log('Starting POSTS for ', path)
                    result.forEach((u) => {
                        user_options = { ...options }
                        user_options.path = path;
                        user_options.headers.cookie = `SID=${u.userSession.sessionID}; USER=test`;
                        user_options.body = {onlyCreator: true, title: 'Test title', description: 'Test description'}
                        user_options.headers['Content-Length'] = user_options.body.toString().length;
                        user_options.headers.connection = {
                            'content-length': user_options.body.toString().length
                        }

                        console.log("SENDING:", user_options);

                        try {
                            https.request(user_options, (response) => {
                                total_data = ""
                                response.on('data', (data) => {
                                    total_data += data;
                                    response.end();

                                });
                                response.on('end', () => {
                                    console.log('end reached on post')
                                    console.log(total_data);
                                })
                            })
                        }
                        catch (err) {
                            console.log(err);
                        }
                    });
                });
        
        });
    }
    else {
        console.log('issue pulling paths from list, may have ran into issue initializing available paths');
    }

}