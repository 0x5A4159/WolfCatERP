const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
const task = require('./models/tasks');
const bodyparser = require('body-parser');
const net = require('net');
const fs = require('fs');
const https = require('https');
const app = express();
const session = require('express-session');
const mongodbsession = require('connect-mongodb-session')(session);
const bcrypt = require('bcryptjs');
const genRandKey = require('./helperfuncs');
const cookieParser = require('cookie-parser');
let userStat = {}; // empty object which gets appended with user ip and their requests for last X seconds according to timer at end of page

// initialize view engine and load env variables and needed files
app.set('view engine', 'ejs');
serverport = process.env.SERVERPORT;
serverip = process.env.SERVERIPADDR;
//const sessionKeySecret = fs.readFileSync('./rsa/sessiontoken.txt').toString();
const key = fs.readFileSync('./rsa/localhost.key');
const cert = fs.readFileSync('./rsa/localhost.crt');
const ONE_MONTH = 1000 * 60 * 60 * 24 * 30;
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

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

app.use(express.static('static'));

app.use(cookieParser());

const isAuth = async (req, res, next) => {
    const userSessionID = req.cookies.SID;
    if (typeof userSessionID !== 'undefined') { // if there's a cookie
        const userExists = await user.exists({ userSession: userSessionID }); // if we can find a matching session id stored in mongo
        if (userExists) {
            next();
        }
        else {
            res.redirect('/404'); // if no user found just kick them to 404
        }
    }
    else {
        res.redirect('/signup');
    }
};

app.get('/setcookie', (req, res) => {
    const secret_sid = genRandKey(128);
    res.cookie('SID', secret_sid, { maxAge: ONE_MONTH, isAuth: true });
    console.log(req.cookies['SID']);
    res.send('cookie saved');
});

app.use((req, _, next) => {
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
        userStat[req.socket.remoteAddress] = {};
    }
    next();
});


// Basic website pages, login and home
app.get("/", (req, res) => {
    res.render('index', {user: capitalizeWord(req.cookies.USER)});
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

// Tasks section

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

app.get("/tasks/history", (req, res) => {
    task.find({ complete: true }).then((result) => {
        res.render('task_history', {
            tasks: result,
            user: capitalizeWord(req.cookies.USER)
        });
    })
        .catch((error) => {
            console.log(error);
            res.redirect('404')
        })
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

app.get("/rustapp", (req, res) => { // this reaches out to an API hosted on a RustLang binary TCP websocket
    let tcpClient = new net.Socket();
    const startTime = performance.now();

    tcpClient.connect(12500, '127.0.0.1', () => {
        
    });
    tcpClient.on('data', (data) => {
        res.send(data.toString());
    });
    tcpClient.on('close', () => {
        const endTime = performance.now();
        console.log(endTime - startTime);
    });
});

const isAdmin = async (request) => {
    isLocalHost = request.socket.remoteAddress === process.env.SERVERIPADDR;
    isCreator = (await user.findOne({ 'userSession': request.session.prototypeSID })).userName === 'admin';
    return [isLocalHost, isCreator].every(Boolean);
}

app.get("/admin/stats", (req, res) => {
    if (isAdmin(req)) {
        res.send({"userStat": userStat, "session": req.cookies });
    }
});

app.get("/admin/funcs", async (req, res) => {
    if (isAdmin(req)) {
        res.render('adminfuncs');
    }
    else {
        res.json({"success": false})
    }

})

app.post("/admin/funcs", async (req, res) => {
    if (isAdmin(req)) {
        switch (req.body.funcName) {
            case 'delManyTasks':
                if (req.body.funcParam !== '') {
                    try {
                        jsonVal = JSON.parse(req.body.funcParam);
                        await task.deleteMany(jsonVal);
                        res.json({ "success": true, "message": "called func successfully" })
                    }
                    catch {
                        res.json({"success": false, "message": "Bad formatting on parameters"})
                    }
                    
                }
                else {
                    res.json({ "success": false, "message": "parameters were empty." });
                }
                break;

            case 'completeAll':
                await task.updateMany({}, { '$set': { 'complete': true } });
                break;

            default:
                res.json({ 'success': false, 'message': 'no known command' });
        }
    }
    else {
        console.log('failed');
    }
});

app.post("/signup", async (req, res) => {
    if (passwordValidator(req.body.userPass)) {
        if (emailValidator(req.body.userEmail)) {
            let isUserExist = await user.findOne({ userEmail: req.body.userEmail });
            let latestUser = await user.find().sort({ userID: -1 }).limit(1); // will use this to generate new max user id

            const maxUserID = typeof latestUser[0] === "undefined" ? 0 : latestUser[0].userID;

            if (isUserExist === null) {
                const hashedPass = await bcrypt.hash(req.body.userPass, 10);
                const secretToken = genRandKey(128);
                await user.create({
                    userName: req.body.userName.toLowerCase(),
                    userEmail: req.body.userEmail.toLowerCase(),
                    userPass: hashedPass,
                    userRole: 1,
                    userID: maxUserID + 1,
                    userSession: secretToken
                }).then((result) => {
                    res.cookie('SID', secretToken, { expires: new Date(253402300000000) });
                    res.cookie('USER', req.body.userName, { expires: new Date(253402300000000) });
                    result.save();
                    res.status(201).send({ "success": true });
                }).catch((err) => {
                    console.log("Couldn't create new member");
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
    const userObj = await user.findOne({ "userName": req.body.userName.toLowerCase() });
    if (userObj !== null) {
        const passMatch = await bcrypt.compare(req.body.userPass, userObj.userPass);
        if (passMatch) {
            const secretToken = genRandKey(128);
            res.cookie('SID', secretToken, { expires: new Date(253402300000000) });
            res.cookie('USER', req.body.userName, { expires: new Date(253402300000000) });
            userObj.userSession = secretToken;
            userObj.save();
            res.status(200).send({ "success": true, "message": "Successfully signed in." });
        }
        else {
            res.status(404).send({ "success": false, "message": "Incorrect sign-in info." });
        }
    }
    else {
        res.status(404).send({ "success": false, "message": "Incorrect sign-in info." });
    }
})

app.post('/tasks/api/delOne', (req, res) => {
    if (userStat[req.socket.remoteAddress][userRequest] > 5) {
        res.status(400).json({ success: false });
    }
    else {
        try {
            task.findById(req.body.popid).then(async (result) => {
                if (result) {
                    result.complete = true
                    await result.save()
                    res.status(200).json({ success: true });
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
    }
});

app.post('/tasks/api/addOne', (req, res) => {
    if (userStat[req.socket.remoteAddress][userRequest] > 5) {
        res.status(400).json({ success: false });
    }
    else {
        const userTitle = req.body.title;
        let userDesc = req.body.description.length === 0 ? "No description" : req.body.description;

        try {
            successcreatedate = Date.now()
            createdByUser = user.findOne({ 'userSession': req.cookies.SID }).then((sessionUserVal) => {
                task.create({ // create the task under the name of whoever matches the session id in their cookies
                    title: userTitle,
                    description: userDesc.length === 0 ? "No description" : userDesc,
                    complete: false,
                    createdate: successcreatedate,
                    createdby: capitalizeWord(sessionUserVal.userName)
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
    }
});

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

setInterval(() => {
    userStat = {};
}, 15_000);