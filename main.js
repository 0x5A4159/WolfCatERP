const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
const task = require('./models/tasks');
const bodyparser = require('body-parser');
const net = require('net');

const app = express();

app.set('view engine', 'ejs');

serverport = process.env.SERVERPORT;
serverip = process.env.SERVERIPADDR;

console.log(serverip, serverport);

mongoose.connect('mongodb://127.0.0.1:27017/appdb')
    .then((result) => { console.log("DB connect on localhost:27017"); app.listen(serverport,serverip); })
    .catch((err) => console.log("Failed connect"));

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

app.use(express.static('static'));

app.use((req, _, next) => {
    console.log(req.protocol + '://' + req.get('host') + req.originalUrl); // fully qualified url
    next();
})

app.get("/", (req, res) => {
    res.render('index'); // simulating no user sign-in
});

app.get("/home", (_, res) => {
    res.redirect("/");
});

app.get("/index", (_, res) => {
    res.redirect("/");
});

app.get("/tasks", (req, res) => {
    task.find({ complete: false })
        .then((result) => {
            res.render('tasks', { tasks: result });
        })
        .catch((error) => {
            console.log('Failed load tasks to /tasks/', error);
        });
});

app.get("/tasks/id/:urlid", (req, res) => { // now supporst ability to view tasks (Yay!)
    const id_to_find = req.params.urlid;
    task.findById(id_to_find).then((result) => {
        res.render('individual_task', { task: result });
    })
    .catch((error) => {
        console.log(error);
        res.redirect('404');
    });
});

app.get("/tasks/history", (req, res) => {
    task.find({ complete: true }).then((result) => {
        res.render('task_history', { tasks: result });
    })
        .catch((error) => {
            console.log(error);
            res.redirect('404')
        })
});

app.get("/signin", (req, res) => {
    res.render('signin');
});

app.get("/signup", (req, res) => {
    res.render('signup');
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

app.get("/tasks/api/fetchAll", (_, res) => {
    task.find({ complete: false })
        .then((result) => {
            res.send(result);
        })
        .catch((error) => {
            console.log('Failed understand fetchAll request', error);
        });
});

app.get("/tasks/api/delOne/:urlid", (req, res) => { // add user authentication so random requests cant be made, or invalid power requests
    task.findById(req.params.urlid).then(async (result) => {
        if (result) {
            result.complete = true;
            await result.save();
            res.status(200).json({ success: true });
        }
        else {  // for bad requests
            res.status(404).json({ success: false });
        }
    })
    .catch((error) => {
        console.log(error);
    });
});

app.post("/signin", async (req, res) => {
    let signinuser = await searchFind(req.params.urlid);

    console.log('signinuser = ', signinuser);

    res.redirect('/'); // on complete sign in push to index
})

app.post('/tasks/api/addOne', (req, res) => {
    const userTitle = req.body.title;
    let userDesc = req.body.description.length === 0 ? "No description" : req.body.description;

    try {
        task.create({
            title: userTitle,
            description: userDesc.length === 0 ? "No description" : userDesc,
            complete: false
        }).then((result) => {
            res.status(200).send({ "success": true, "id": result._id });
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).send({ "success": false, "id": "0"});
    }
});

app.use((req, res) => {
    res.status(404).render('404');
});

const searchFind = async (objFind) => {
    return await user.findOne({ userName: objFind });
};