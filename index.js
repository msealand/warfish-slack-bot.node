const request = require('request');
const urlUtils = require('url');

const REST_API_URL = process.env["REST_API_URL"] || 'http://warfish.net/war/services/rest.py';
const gameIds = (process.env["GAME_IDS"] || "20129138,44843295" || "").split(',').map(s => s.trim());

function getPlayerStates(gid) {
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
                if (!state) { return reject(new Error("Invalid response (no body)")) }
                let playerStates = (((state._content || {}).players || {})._content || {}).player;
                if (!playerStates) { return reject(new Error("Invalid response (no players)")) }

                return resolve({ gameId: gid, playerStates: playerStates });
            } else {
                return reject(new Error("Invalid response"));
            }
        });
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

Promise.all(gameIds.map(getPlayerStates)).then((gamePlayerStates) => {
    gamePlayerStates.sort((gps1, gps2) => (gps1.gameId - gps2.gameId));
    gamePlayerStates.forEach((gps) => {
        console.log(`GameId: ${gps.gameId}`);
        displayTurns(gps.playerStates);
    });
})
