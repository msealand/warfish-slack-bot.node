const restify = require('restify');
const warfish = require('./warfish');
const request = require('request');
const slack = require('@slack/client');

const TOKEN = process.env["TOKEN"] || '';
const slackClient = new slack.WebClient(TOKEN);

let slackUsersToWarfish = {};
let warfishUsersToSlack = {};

let allGames = [];

function healthCheck(req, res, next) {
    res.send({ status: 'ok' });
    next();
}

function setUserProfile(req, res, next) {
    console.log(`Set user profile request: ${JSON.stringify(req.body, null, 2)}`);

    let profileId = req.body.text;
    let slackUserId = req.body.user_name;

    slackUsersToWarfish[slackUserId] = profileId;
    warfishUsersToSlack[profileId] = slackUserId;

    res.send({ text: `Your warfish profileId is now ${profileId}` });

    next();
}

function addGame(req, res, next) {
    console.log(`Add game request: ${JSON.stringify(req.body, null, 2)}`);

    let gameId = req.body.text;
    let responseUrl = req.body.response_url;
    res.send({ text: `Game ${gameId} added` });

    getGame(gameId, responseUrl);

    next();
}

function addRSS(req, res, next) {
    console.log(`Add RSS feed request: ${JSON.stringify(req.body, null, 2)}`);

    let feedUrl = req.body.text;
    let responseUrl = req.body.response_url;
    res.send({ text: `Processing RSS feed ${feedUrl}...` });

    processRSSFeed(feedUrl, responseUrl);

    next();
}

function getGame(gameId, responseUrl) {
    warfish.getGame(gameId).then((game) => {
        game.id = gameId;
        warfish.getPlayerStates(game).then((game) => {
            processGame(game, responseUrl);
        });
    });
}

function checkGameChannel(game) {
    console.log(`GAME: ${JSON.stringify(game, null, 2)}`);

    let channelName = game.name;
    if (!channelName) {
        channelName = `game-${game.id}`;
    }

    return new Promise((resolve, reject) => {
        slackClient.channels.join(`#${channelName}`, (err, info) => {
            if (err) {
                console.log(`Error joining channel: ${err}`);
            } else {
                console.log(`Joined channel ${JSON.stringify(info)}`);
            }

            game.channel = `#${channelName}`;
            resolve(game);
        })
    });
}

function updateGame(game) {
    getGame(game.id);
}

function upsertGame(game) {
    let existingGame = allGames.find(g => g.id == game.id);
    if (!existingGame) { 
        allGames.push(game);
        setInterval(updateGame.bind(null, game), 60000);

        console.log(`Updating ${game.id} every minute`);
    }
}

function processGame(game, responseUrl) {
    upsertGame(game);

    checkGameChannel(game).then((game) => {
        let playerStates = game.playerStates;

        let text;
        let turns = playerStates.filter((player) => player.isturn == "1");
        if (turns.length > 0) {
            turns = turns.map((p) => {
                console.log(p);
                let name = p.name;
                let profileId = p.profileid;
                if (warfishUsersToSlack[profileId]) {
                    name += ` (@${warfishUsersToSlack[profileId]})`
                }
                return name;
            }).sort();
            let lastName = turns.pop();
            if (lastName.toLowerCase()[lastName.length - 1] == 's') { lastName += "'"; }
            else { lastName += "'s"; }
            turns.push(lastName);
            if (turns.length > 2) {
                turns.push(`and ${turns.pop()}`);
                if (turns.length > 1) {
                    turns = turns.join(', ');
                }
            } else if (turns.length > 1) {
                turns = turns.join(' and ');
            } else {
                turns = turns[0];
            }
            text = `It is ${turns} turn`;
        } else {
            text = `Game Over!`;
        }

        if (text && game.channel) {
            slackClient.chat.postMessage(game.channel, text, (err, info) => {
                if (err) {
                    console.log(`Error posting message: ${err}`);
                } else {
                    console.log(`Posted message: ${JSON.stringify(info, null, 2)}`);
                }
            });
        }
    });
}

function processRSSFeed(feedUrl, responseUrl) {
    console.log(`Processing ${feedUrl}`);

    warfish.getRSSGames(feedUrl).then((games) => {
        return warfish.getGameStats(games).then((gameStates) => {
            gameStates.forEach((game) => {
                processGame(game, responseUrl);
            });
        });
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

