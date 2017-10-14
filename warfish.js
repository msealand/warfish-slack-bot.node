const request = require('request');
const urlUtils = require('url');
const Feedparser = require('feedparser');

const REST_API_URL = process.env["REST_API_URL"] || 'http://warfish.net/war/services/rest.py';

function getRSSGames(feedUrl) {
    return new Promise((resolve, reject) => {
        let data = {
            url: feedUrl
        }

        let games = [];
        let feedparser = new Feedparser();
        request(data).pipe(feedparser);

        feedparser.on('error', function (error) {
            console.log(`Parse error: ${error.message || error}`);
            reject(error);
        });

        feedparser.on('readable', function () {
            let meta = this.meta;
            let item;

            while (item = this.read()) {
                try {
                    let name = item.title;
                    let url = urlUtils.parse(item.link);
                    let queries = url.query.split('&').map((q) => {
                        let parts = q.split('=');
                        return { name: parts[0], value: parts[1] }
                    }).reduce((data, q) => {
                        data[q.name] = q.value;
                        return data;
                    }, {})

                    if (queries.gid) {
                        let gid = queries.gid;
                        name = name.replace(/^[0-9]+\.?\s*/, '');
                        games.push({ name: name, gid: gid });
                    }
                } catch (_) { }
            }
        });

        feedparser.on('end', () => {
            resolve(games);
        });
    });
}

function getPlayerStates(game) {
    let gid = game.gid || game.gameId;


    let params = {
        _format: 'json',
        _method: 'warfish.tables.getState',
        gid: gid,
        sections: 'players'
    }

    let req = {
        url: REST_API_URL,
        qs: params,
        json: true
    }

    return new Promise((resolve, reject) => {
        request(req, (err, response) => {
            if (err) {
                return reject(err);
            } else if (response) {
                let state = response.body;

                // console.log(JSON.stringify(response.body, null, 2));

                if (!state) { return reject(new Error("Invalid response (no body)")) }
                let playerStates = (((state._content || {}).players || {})._content || {}).player;
                if (!playerStates) { return reject(new Error("Invalid response (no players)")) }

                game.playerStates = playerStates;
                return resolve(game);
            } else {
                return reject(new Error("Invalid response"));
            }
        });
    });

}

function getGameStats(games) {
    //    let gameIds = games.map(g => g.gid);
    return Promise.all(games.map(getPlayerStates)).then((gamePlayerStates) => {
        gamePlayerStates.sort((gps1, gps2) => (gps1.gameId - gps2.gameId));
        return gamePlayerStates
    });
}

function displayTurns(playerStates) {
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
        console.log(`It is ${turns} turn`);
    } else {
        console.log(`Game over!`);
    }

    console.log();
}

function displayGameState(games) {
    //    let gameIds = games.map(g => g.gid);
    Promise.all(games.map(getPlayerStates)).then((gamePlayerStates) => {
        gamePlayerStates.sort((gps1, gps2) => (gps1.gameId - gps2.gameId));
        gamePlayerStates.forEach((gps) => {
            console.log(`GameId: ${gps.gameId}`);

            console.log(`Player States:\n${JSON.stringify(gps.playerStates, null, 2)}`);

            displayTurns(gps.playerStates);
        });
    })
}

module.exports.getRSSGames = getRSSGames;
module.exports.getGameStats = getGameStats;
module.exports.getPlayerStates = getPlayerStates;

