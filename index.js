const restify = require('restify');
const warfish = require('./warfish');
const request = require('request');
const slack = require('@slack/client');

const TOKEN = process.env["TOKEN"] || '';
const slackClient = new slack.WebClient(TOKEN);

function healthCheck(req, res, next) {
    res.send({ status: 'ok' });
    next();
}

function addRSS(req, res, next) {
    console.log(`Add RSS request`);
    //console.log(req.body);

    let feedUrl = req.body.text;
    let responseUrl = req.body.response_url;
    res.send({ text: `Processing RSS feed ${feedUrl}...` });

    processRSSFeed(feedUrl, responseUrl);

    next();
}

function checkGameChannel(game) {
    console.log(`GAME: ${JSON.stringify(game, null, 2)}`);

    slackClient.channels.list((err, info) => {
        if (err) {
            console.log(`Error: ${err}`);
        } else {
            // console.log(JSON.stringify(info, null, 2));
            info.channels.forEach((channel) => {
                console.log(`Channel ${channel.name}`);
            });
        }
    });
}

function processRSSFeed(feedUrl, responseUrl) {
    console.log(`Processing ${feedUrl}`);

    warfish.getRSSGames(feedUrl).then((games) => {
        return warfish.getGameStats(games).then((gameStates) => {
            gameStates.forEach((game) => {

                checkGameChannel(game);

                let playerStates = game.playerStates;

                let text;
                let turns = playerStates.filter((player) => player.isturn == "1");
                if (turns.length > 0) {
                    turns = turns.map(p => p.name).sort();
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
                    text = `It is ${turns} turn in ${game.name}`;
                } else {
                    text = `${game.name} is over!`;
                }

                if (text) {

                    console.log(`Posting '${text}' to '${responseUrl}'`);

                    let reqData = {
                        uri: responseUrl,
                        method: 'POST',
                        json: { text: text }
                    }
                    request(reqData, (err, response, body) => {
                        if (err) console.log(`Err: ${err.message || err}`);
                        if (body) console.log(`Body: ${body}`);
                    });
                }
            });
        });
    });
}

let server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.get('/health', healthCheck);
server.head('/health', healthCheck);

server.post('/cmd/rss', addRSS);

server.listen(8080, () => {
    console.log(`${server.name} listening at ${server.url}`);
});

