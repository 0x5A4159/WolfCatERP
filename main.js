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
let userStat = {};

// initialize view engine and load env variables and needed files
app.set('view engine', 'ejs');
serverport = process.env.SERVERPORT;
serverip = process.env.SERVERIPADDR;
const sessionKeySecret = fs.readFileSync('./rsa/sessiontoken.txt').toString();
const key = fs.readFileSync('./rsa/localhost.key');
const cert = fs.readFileSync('./rsa/localhost.crt');
const server = https.createServer({ key: key, cert: cert }, app);


// Loading mongodb assets
mongoose.connect('mongodb://127.0.0.1:27017/appdb')
    .then((result) => { console.log("DB connect on localhost:27017"); server.listen(serverport,serverip); })
    .catch((err) => console.log("Failed connect"));

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

app.use(express.static('static'));

const sessionStore = new mongodbsession({
    uri: 'mongodb://127.0.0.1:27017/appdb',
    collection: 'sessions'
});

// initializing session storage

app.use(session({
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    secret: sessionKeySecret,
    store: sessionStore,
    httpOnly: false,
    cookie: {
        maxAge: 1704085200,
        sameSite: true,
        secure: 'development'
    }
}));

const isAuth = (req, res, next) => {
    if (req.session.isAuth) {
        next();
    }
    else {
        res.redirect('/signin');
    }
}

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
    res.render('index', {user: capitalizeWord(req.session.userName)});
});

app.get("/home", (_, res) => {
    res.redirect("/");
});

app.get("/index", (_, res) => {
    res.redirect("/");
});

app.get("/signin", (req, res) => {
    if (req.session.isAuth) {
        res.redirect('/')
    }
    else {
        res.render('signin');
    }
});

app.get("/signup", (req, res) => {
    if (req.session.isAuth) {
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
            res.render('tasks', { tasks: result, user: capitalizeWord(req.session.userName)});
        })
        .catch((error) => {
            console.log('Failed load tasks to /tasks/', error);
        });
});

app.get("/tasks/id/:urlid", (req, res) => {
    const id_to_find = req.params.urlid;
    task.findById(id_to_find).then((result) => {
        res.render('individual_task', { task: result, user: capitalizeWord(req.session.userName) });
    })
    .catch((error) => {
        console.log(error);
        res.redirect('404');
    });
});

app.get("/tasks/history", (req, res) => {
    task.find({ complete: true }).then((result) => {
        res.render('task_history', { tasks: result, user: capitalizeWord(req.session.userName) });
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

app.get("/rustapp", (req, res) => {
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

app.get("/admin/stats", (req, res) => {
    if (req.socket.remoteAddress === process.env.SERVERIPADDR) {
        res.send({"userStat": userStat, "session": req.session });
    }
});

app.post("/signup", async (req, res) => {
    if (passwordValidator(req.body.userPass)) {
        if (emailValidator(req.body.userEmail)) {
            let isUserExist = await user.findOne({ userEmail: req.body.userEmail });
            let latestUser = await user.find().sort({ userID: -1 }).limit(1);

            const maxUserID = typeof latestUser[0] === "undefined" ? 0 : latestUser[0].userID;

            if (isUserExist === null) {
                const hashedPass = await bcrypt.hash(req.body.userPass, 10);
                await user.create({
                    userName: req.body.userName.toLowerCase(),
                    userEmail: req.body.userEmail.toLowerCase(),
                    userPass: hashedPass,
                    userRole: 1,
                    userID: maxUserID + 1
                }).then((result) => {
                    req.session.isAuth = true;
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
        if (passMatch) { // implement hashing
            req.session.isAuth = true;
            req.session.userName = req.body.userName;
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
            task.create({
                title: userTitle,
                description: userDesc.length === 0 ? "No description" : userDesc,
                complete: false,
                createdate: successcreatedate
            }).then((result) => {
                res.status(200).send({ "success": true, "id": result._id, "createdate": successcreatedate});
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