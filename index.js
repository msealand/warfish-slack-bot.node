const restify = require('restify');
const warfish = require('./warfish');
const request = require('request');
const slack = require('@slack/client');

const TOKEN = process.env["TOKEN"] || '';
const slackClient = new slack.WebClient(TOKEN);

let slackUsersToWarfish = {};
let warfishUsersToSlack = {};

function healthCheck(req, res, next) {
    res.send({ status: 'ok' });
    next();
}

function setUserProfile(req, res, next) {
    console.log(`Set user profile request: ${JSON.stringify(req.body, null, 2)}`);

    let profileId = req.body.text;
    let slackUserId = req.body.user_id;

    slackUsersToWarfish[slackUserId] = profileId;
    warfishUsersToSlack[profileId] = slackUserId;

    res.send({ text: `Your warfish profileId is now ${profileId}` });

    next();
}

function addGame(req, res, next) {
    console.log(`Add game request: ${JSON.stringify(req.body, null, 2)}`);

    let gameId = req.body.text;
    res.send({ text: `Adding game ${gameId}` });

    getGame(gameId);

    next();
}

function addRSS(req, res, next) {
    console.log(`Add RSS feed request: ${JSON.stringify(req.body, null, 2)}`);

    let feedUrl = req.body.text;
    res.send({ text: `Processing RSS feed ${feedUrl}...` });

    processRSSFeed(feedUrl);

    next();
}

function getPlayerName(game, pid) {
    let name = warfishUsersToSlack[pid];
    if (name) { name = `<@${name}>`; }
    else { name = game.getPlayerName(pid); }
    return name;
}

function niceList(list) {
    if (list && (list.length > 0)) {
        let items = list.sort();
        if (items.length > 2) {
            items.push(`and ${items.pop()}`);
            items = items.join(', ');
        } else if (items.length > 1) {
            items = items.join(' and ');
        } else {
            items = items[0];
        }

        return items;
    } else {
        return '';
    }
}

function playersLeft(game, players) {
    let text = `${niceList(players.map(getPlayerName.bind(null, game)))} left`;

    checkGameChannel(game).then((game) => {
        slackClient.chat.postMessage(game.channel, text, (err, info) => {
            if (err) {
                console.log(`Error posting message: ${err}`);
            } else {
                console.log(`Posted message: ${JSON.stringify(info, null, 2)}`);
            }
        });
    });
}

function playersJoined(game, players) {
    // let text = `${niceList(players.map(getPlayerName.bind(null, game)))} joined`;

    checkGameChannel(game).then((game) => {
        let slackUsers = players.map(pid => warfishUsersToSlack[pid]).filter(p => !!p);
        slackUsers.forEach((uid) => {
            slackClient.channels.invite(game.channelId, uid, (err, info) => {
                if (err) {
                    console.log(`Error inviting user: ${err}`);
                } else {
                    console.log(`Invited ${uid} to ${game.channelId}: ${JSON.stringify(info || {}, null, 2)}`);
                }
            });
        });
        // slackClient.chat.postMessage(game.channel, text, (err, info) => {
        //     if (err) {
        //         console.log(`Error posting message: ${err}`);
        //     } else {
        //         console.log(`Posted message: ${JSON.stringify(info, null, 2)}`);
        //     }
        // });
    });
}

function playersEliminated(game, players) {
    let ww = players.length > 1 ? 'were' : 'was'
    let text = `${niceList(players.map(getPlayerName.bind(null, game)))} ${ww} eliminated`;

    checkGameChannel(game).then((game) => {
        slackClient.chat.postMessage(game.channel, text, (err, info) => {
            if (err) {
                console.log(`Error posting message: ${err}`);
            } else {
                console.log(`Posted message: ${JSON.stringify(info, null, 2)}`);
            }
        });
    });
}

function playersTurns(game, players) {
    let text = `${niceList(players.map(getPlayerName.bind(null, game)))}, it is your turn`;

    checkGameChannel(game).then((game) => {
        slackClient.chat.postMessage(game.channel, text, (err, info) => {
            if (err) {
                console.log(`Error posting message: ${err}`);
            } else {
                console.log(`Posted message: ${JSON.stringify(info, null, 2)}`);
            }
        });
    });
}

function getGame(gameId) {
    let game = warfish.getGame(gameId);
    if (!game.initializedSlack) {
        game.initializedSlack = true;

        console.log(`Setting up event listeners for Slack on game ${gameId}`);

        game.on('players_left', playersLeft.bind(null, game));
        game.on('players_joined', playersJoined.bind(null, game));
        game.on('players_eliminated', playersEliminated.bind(null, game));
        game.on('players_turns', playersTurns.bind(null, game));
        game.setUpdateInterval(60000);
    }
}

function checkGameChannel(game) {
    if (game.channel) { return Promise.resolve(game); }
    
    game.channel = `#${game.name}`;
    return new Promise((resolve, reject) => {
        slackClient.channels.join(`#${game.channel}`, (err, info) => {
            if (err) {
                console.log(`Error joining channel: ${err}`);
            } else {
                console.log(`Joined channel ${JSON.stringify(info)}`);
                game.channelId = info.channel.id;
                game.channelLink = `<#${info.channel.id}|${info.channel.name}>`;
            }
            resolve(game);
        })
    });
}

function processRSSFeed(feedUrl) {
    console.log(`Processing ${feedUrl}`);

    warfish.getRSSGames(feedUrl).then((games) => {
        games.forEach(g => getGame(g));
    });
}

let server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.get('/health', healthCheck);
server.head('/health', healthCheck);

server.post('/cmd/rss', addRSS);
server.post('/cmd/addgame', addGame);
server.post('/cmd/iam', setUserProfile);

server.listen(8080, () => {
    console.log(`${server.name} listening at ${server.url}`);
});
