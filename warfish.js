const request = require('request');
const urlUtils = require('url');
const Feedparser = require('feedparser');
const events = require('events');

const REST_API_URL = process.env["REST_API_URL"] || 'http://warfish.net/war/services/rest.py';

let _games = {};

class WarFishGame extends events.EventEmitter {

    constructor(data) {
        super();

        if (typeof data === 'string') { data = { id: data }; }
        this._updateData(data);
    }

    setUpdateInterval(interval) {
        if (!this._updateInterval) {
            console.log(`Updating game ${this.id} every ${interval}ms`);

            this._updateInterval = setInterval(() => {
                console.log(`Checking for game ${this.id} updates`);

                getGame(this);
            }, interval);
        }
    }

    clearUpdateInterval() {
        clearInterval(this._updateInterval);
        this._updateInterval = undefined;
    }

    get isWarFishGame() { return true; }

    _checkPlayerDiffs(data) {
        // console.log(`Diffing player data with: ${JSON.stringify(data || {}, null, 2)}`);

        let playerDiffs = {};

        let newPlayerData = ((data.players || {})._content || {}).player || [];
        let existingPlayerData = this.players;

        // This logic doesn't really work... player turns can get missed, etc.
        
        if (newPlayerData.length != existingPlayerData.length) {
            let newProfiles = new Set(newPlayerData.map(p => p.profileid));
            let existingProfiles = new Set(existingPlayerData.map(p => p.profileid));

            let joinedSet = new Set(newProfiles);
            existingProfiles.forEach(pid => joinedSet.delete(pid));

            let leftSet = new Set(existingProfiles);
            newProfiles.forEach(pid => leftSet.delete(pid));

            playerDiffs.joined = Array.from(joinedSet);
            playerDiffs.left = Array.from(leftSet);
        }

        let newTurns = new Set(newPlayerData.filter(p => p.isturn == "1").map(p => p.profileid));
        let existingTurns = new Set(existingPlayerData.filter(p => p.isturn == "1").map(p => p.profileid));

        let currentTurns = new Set(newTurns);
        existingTurns.forEach(pid => currentTurns.delete(pid));
        playerDiffs.turns = Array.from(currentTurns);

        let newEliminated = new Set(newPlayerData.filter(p => p.active != "1").map(p => p.profileid));
        let existingEliminated = new Set(existingPlayerData.filter(p => p.active != "1").map(p => p.profileid));

        let currentEliminated = new Set(newEliminated);
        existingEliminated.forEach(pid => currentEliminated.delete(pid));
        playerDiffs.eliminated = Array.from(currentEliminated);

        console.log(`Player diffs for game ${this.id}: ${JSON.stringify(playerDiffs, null, 2)}`);

        return playerDiffs;
    }

    _updateData(data) {
        if (data._content) { data = data._content; }

        let playerDiffs = this._checkPlayerDiffs(data);
        this._data = Object.assign(this._data || {}, data);

        if (playerDiffs.left && (playerDiffs.left.length > 0)) { this.emit('players_left', playerDiffs.left); }        
        if (playerDiffs.joined && (playerDiffs.joined.length > 0)) { this.emit('players_joined', playerDiffs.joined); }
        if (playerDiffs.eliminated && (playerDiffs.eliminated.length > 0)) { this.emit('players_eliminated', playerDiffs.eliminated); }
        if (playerDiffs.turns && (playerDiffs.turns.length > 0)) { this.emit('players_turns', playerDiffs.turns); }
        
        this.emit('game_updated', this);
    }

    get data() {
        return this._data || {};
    }

    get id() {
        return this.data.id;
    }

    get name() {
        return `game-${this.id}`;
    }

    get players() {
        return (((this.data.players || {})._content || {}).player) || [];
    }

    getPlayerName(pid) {
        let name = pid;
        let player = this.players.find(p => p.profileid == pid);
        if (player && player.name) { name = player.name }
        return name;
    }
}

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
                        name = name.replace(/^\[?[0-9]+\]?\.?\-?\s*/, '');
                        games.push(gid); //{ name: name, id: gid });
                    }
                } catch (_) { }
            }
        });

        feedparser.on('end', () => {
            resolve(games);

            // Promise.all(games.map(getGame)).then((games) => {
            //     resolve(games);
            // });
        });
    });
}

function getGame(game) {
    if (typeof game === 'string') { game = { id: game }; }
    if (!game.isWarFishGame) { 
        let wfGame = _games[game.id];
        if (!wfGame) {
            wfGame = new WarFishGame(game);
            _games[wfGame.id] = wfGame;
        }
        game = wfGame;
    }

    let sections = ['players','cards','board'];
    // if (!game.details) { sections.push('details'); }

    let params = {
        _format: 'json',
        _method: 'warfish.tables.getState',
        gid: game.id,
        sections: sections.join(',')
    }
    
    let req = {
        url: REST_API_URL,
        qs: params,
        json: true
    }

    // return new Promise((resolve, reject) => {
        request(req, (err, response) => {
            if (err) {
                return reject(err);
            } else if (response) {
                let gameData = response.body;
                game._updateData(gameData);
                // resolve(game);
            }
        });
    // });

    return game;
}

module.exports.WarFishGame = WarFishGame;
module.exports.getRSSGames = getRSSGames;
module.exports.getGame = getGame;
