/******************************************************************************
 *                                                                            *
 *    This file is part of Kokopu, a JavaScript chess library.                *
 *    Copyright (C) 2018  Yoann Le Montagner <yo35 -at- melix.net>            *
 *                                                                            *
 *    This program is free software: you can redistribute it and/or           *
 *    modify it under the terms of the GNU Lesser General Public License      *
 *    as published by the Free Software Foundation, either version 3 of       *
 *    the License, or (at your option) any later version.                     *
 *                                                                            *
 *    This program is distributed in the hope that it will be useful,         *
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of          *
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the            *
 *    GNU Lesser General Public License for more details.                     *
 *                                                                            *
 *    You should have received a copy of the GNU Lesser General               *
 *    Public License along with this program. If not, see                     *
 *    <http://www.gnu.org/licenses/>.                                         *
 *                                                                            *
 ******************************************************************************/


'use strict';


var exception = require('./exception');
var i18n = require('./i18n');

var Position = require('./position').Position;
var Game = require('./game').Game;


// Conversion table NAG -> numeric code
var SPECIAL_NAGS_LOOKUP = {
	'!!' :  3,             // very good move
	'!'  :  1,             // good move
	'!?' :  5,             // interesting move
	'?!' :  6,             // questionable move
	'?'  :  2,             // bad move
	'??' :  4,             // very bad move
	'+-' : 18,             // White has a decisive advantage
	'+/-': 16,             // White has a moderate advantage
	'+/=': 14, '+=' : 14,  // White has a slight advantage
	'='  : 10,             // equal position
	'~'  : 13, 'inf': 13,  // unclear position
	'=/+': 15, '=+' : 15,  // Black has a slight advantage
	'-/+': 17,             // Black has a moderate advantage
	'-+' : 19              // Black has a decisive advantage
};


/**
 * Parse a header value, unescaping special characters.
 *
 * @param {string} rawHeaderValue
 * @returns {string}
 * @ignore
 */
function parseHeaderValue(rawHeaderValue) {
	return rawHeaderValue.replace(/\\([\\"[\]])/g, '$1');
}


/**
 * Parse a comment, unescaping special characters, and looking for the `[%key value]` tags.
 *
 * @param {string} rawComment String to parse.
 * @returns {{comment:string, tags:Object}}
 * @ignore
 */
function parseCommentValue(rawComment) {
	rawComment = rawComment.replace(/\\([{}\\])/g, '$1');

	var tags = {};

	// Find and remove the tags from the raw comment.
	var comment = rawComment.replace(/\[%([a-zA-Z]+) ([^[\]]+)\]/g, function(match, p1, p2) {
		tags[p1] = p2;
		return ' ';
	});

	// Trim the comment and collapse sequences of space characters into 1 character only.
	comment = comment.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
	if(comment === '') {
		comment = undefined;
	}

	// Return the result
	return { comment:comment, tags:tags };
}


// PGN token types
var /* const */ TOKEN_HEADER          = 1; // Ex: [White "Kasparov, G."]
var /* const */ TOKEN_MOVE            = 2; // SAN notation or -- (with an optional move number)
var /* const */ TOKEN_NAG             = 3; // $[1-9][0-9]* or a key from table SPECIAL_NAGS_LOOKUP (!!, +-, etc..)
var /* const */ TOKEN_COMMENT         = 4; // {some text}
var /* const */ TOKEN_BEGIN_VARIATION = 5; // (
var /* const */ TOKEN_END_VARIATION   = 6; // )
var /* const */ TOKEN_END_OF_GAME     = 7; // 1-0, 0-1, 1/2-1/2 or *


/**
 * @class
 * @classdesc Stream of tokens.
 * @ignore
 */
function TokenStream(pgnString) {
	this.text           = pgnString; // what is being parsed
	this._pos           = 0;         // current position in the string
	this.emptyLineFound = false;     // whether an empty line has been encountered by skipBlank()
	this.token          = 0;         // current token
	this.tokenValue     = null;      // current token value (if any)
	this.tokenPos       = 0;         // position of the current token in the string

	// Space-like matchers
	this._matchSpaces = /[ \f\t\v]+/g;
	this._matchLineBreak = /\r?\n|\r/g;

	// Token matchers
	this._matchHeader = /\[\s*(\w+)\s+"((?:[^\\"[\]]|\\[\\"[\]])*)"\s*\]/g;
	this._matchMove = /(?:[1-9][0-9]*\s*\.(?:\.\.)?\s*)?((?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|(?:[a-h]x?)?[a-h][1-8](?:=?[KQRBNP])?)[+#]?|--)/g;
	this._matchNag = /([!?][!?]?|\+\/?[-=]|[-=]\/?\+|=|inf|~)|\$([1-9][0-9]*)/g;
	this._matchComment = /\{((?:[^{}\\]|\\[{}\\])*)\}/g;
	this._matchBeginVariation = /\(/g;
	this._matchEndVariation = /\)/g;
	this._matchEndOfGame = /1-0|0-1|1\/2-1\/2|\*/g;

	this._matchSpaces.matchedIndex = -1;
	this._matchLineBreak.matchedIndex = -1;
	this._matchHeader.matchedIndex = -1;
	this._matchMove.matchedIndex = -1;
	this._matchNag.matchedIndex = -1;
	this._matchComment.matchedIndex = -1;
	this._matchBeginVariation.matchedIndex = -1;
	this._matchEndVariation.matchedIndex = -1;
	this._matchEndOfGame.matchedIndex = -1;
}


/**
 * Try to match the given regular expression at the current position.
 *
 * @param {TokenStream} stream
 * @param {RegExp} re
 * @returns {boolean}
 * @ignore
 */
function testAtPos(stream, re) {
	if(re.matchedIndex < stream._pos) {
		re.lastIndex = stream._pos;
		re.matched = re.exec(stream.text);
		re.matchedIndex = re.matched === null ? stream.text.length : re.matched.index;
	}
	if(re.matchedIndex === stream._pos) {
		stream._pos = re.lastIndex;
		return true;
	}
	else {
		return false;
	}
}


/**
 * Advance until the first non-blank character.
 *
 * @param {TokenStream} stream
 * @ignore
 */
function skipBlanks(stream) {
	var newLineCount = 0;
	while(stream._pos < stream.text.length) {
		if(testAtPos(stream, stream._matchSpaces)) {
			// Nothing to do...
		}
		else if(testAtPos(stream, stream._matchLineBreak)) {
			++newLineCount;
		}
		else {
			break;
		}
	}

	// An empty line was encountered if and only if at least to line breaks were found.
	stream.emptyLineFound = newLineCount >= 2;
}


/**
 * Try to consume 1 token.
 *
 * @return {boolean} `true` if a token could have been read, `false` if the end of the text has been reached.
 * @throws {module:exception.InvalidPGN} If the text cannot be interpreted as a valid token.
 */
TokenStream.prototype.consumeToken = function() {

	// Consume blank (i.e. meaning-less) characters
	skipBlanks(this);
	if(this._pos >= this.text.length) {
		return false; // -> `false` means that the end of the string have been reached
	}

	// Remaining part of the string
	this.tokenPos = this._pos;

	// Match a game header (ex: [White "Kasparov, G."])
	if(testAtPos(this, this._matchHeader)) {
		this.token      = TOKEN_HEADER;
		this.tokenValue = { key: this._matchHeader.matched[1], value: parseHeaderValue(this._matchHeader.matched[2]) };
	}

	// Match a move or a null-move
	else if(testAtPos(this, this._matchMove)) {
		this.token      = TOKEN_MOVE;
		this.tokenValue = this._matchMove.matched[1];
	}

	// Match a NAG
	else if(testAtPos(this, this._matchNag)) {
		this.token      = TOKEN_NAG;
		this.tokenValue = this._matchNag.matched[2] === undefined ? SPECIAL_NAGS_LOOKUP[this._matchNag.matched[1]] : parseInt(this._matchNag.matched[2], 10);
	}

	// Match a comment
	else if(testAtPos(this, this._matchComment)) {
		this.token      = TOKEN_COMMENT;
		this.tokenValue = parseCommentValue(this._matchComment.matched[1]);
	}

	// Match the beginning of a variation
	else if(testAtPos(this, this._matchBeginVariation)) {
		this.token      = TOKEN_BEGIN_VARIATION;
		this.tokenValue = null;
	}

	// Match the end of a variation
	else if(testAtPos(this, this._matchEndVariation)) {
		this.token      = TOKEN_END_VARIATION;
		this.tokenValue = null;
	}

	// Match a end-of-game marker
	else if(testAtPos(this, this._matchEndOfGame)) {
		this.token      = TOKEN_END_OF_GAME;
		this.tokenValue = this._matchEndOfGame.matched[0];
	}

	// Otherwise, the string is badly formatted with respect to the PGN syntax
	else {
		throw new exception.InvalidPGN(this.text, this._pos, i18n.INVALID_PGN_TOKEN);
	}

	return true;
};


function parseNullableHeader(value) {
	return value === '?' ? undefined : value;
}


function parseDateHeader(value) {
	if(/^([0-9]{4})\.([0-9]{2})\.([0-9]{2})$/.test(value)) {
		var year = RegExp.$1;
		var month = RegExp.$2;
		var day = RegExp.$3;
		year = parseInt(year, 10);
		month = parseInt(month, 10);
		day = parseInt(day, 10);
		if(month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			return new Date(year, month - 1, day);
		}
	}
	else if(/^([0-9]{4})\.([0-9]{2})\.\?\?$/.test(value)) {
		var year = RegExp.$1;
		var month = parseInt(RegExp.$2, 10);
		if(month >= 1 && month <= 12) {
			return { year: parseInt(year, 10), month: month };
		}
	}
	else if(/^([0-9]{4})(?:\.\?\?\.\?\?)?$/.test(value)) {
		return { year: parseInt(RegExp.$1, 10) };
	}
	return undefined;
}


function processHeader(stream, game, initialPositionFactory, key, value) {
	value = value.trim();
	switch(key) {
		case 'White': game.playerName('w', parseNullableHeader(value)); break;
		case 'Black': game.playerName('b', parseNullableHeader(value)); break;
		case 'WhiteElo': game.playerElo('w', value); break;
		case 'BlackElo': game.playerElo('b', value); break;
		case 'WhiteTitle': game.playerTitle('w', value); break;
		case 'BlackTitle': game.playerTitle('b', value); break;
		case 'Event': game.event(parseNullableHeader(value)); break;
		case 'Round': game.round(parseNullableHeader(value)); break;
		case 'Date': game.date(parseDateHeader(value)); break;
		case 'Site': game.site(parseNullableHeader(value)); break;
		case 'Annotator': game.annotator(value); break;

		// The header 'FEN' has a special meaning, in that it is used to define a custom
		// initial position, that may be different from the usual one.
		case 'FEN':
			initialPositionFactory.fen = value;
			initialPositionFactory.fenTokenPos = stream.tokenPos;
			break;

		// The header 'Variant' indicates that this is not a regular chess game.
		case 'Variant':
			if(value.toLowerCase() === 'chess960' || value.toLowerCase() === 'fischerandom') {
				initialPositionFactory.variant = 'chess960';
			}
			else {
				throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.UNKNOWN_VARIANT, value);
			}
			break;
	}
}


function initializeInitialPosition(stream, game, initialPositionFactory) {

	// Nothing to do if no custom FEN has been defined -> let the default state.
	if(!initialPositionFactory.fen) { return; }

	try {
		var position = new Position(initialPositionFactory.variant ? initialPositionFactory.variant : 'regular', 'empty');
		var moveCounters = position.fen(initialPositionFactory.fen);
		game.initialPosition(position, moveCounters.fullMoveNumber);
	}
	catch(error) {
		if(error instanceof exception.InvalidFEN) {
			throw new exception.InvalidPGN(stream.text, initialPositionFactory.fenTokenPos, i18n.INVALID_FEN_IN_PGN_TEXT, error.message);
		}
		else {
			throw error;
		}
	}
}


/**
 * Try to parse 1 game from the given stream.
 *
 * @param {TokenStream} stream
 * @returns {Game?} `null` if the end of the stream has been reached.
 * @throws {module:exception.InvalidPGN}
 * @ignore
 */
function doParseGame(stream) {

	// State variable for syntaxic analysis.
	var game            = null;  // the result
	var node            = null;  // current node (or variation) to which the next move should be appended
	var nodeIsVariation = false; // whether the current node is a variation or not
	var nodeStack       = [];    // when starting a variation, its parent node (btw., always a "true" node, not a variation) is stacked here
	var initialPositionFactory = {};

	// Token loop
	while(stream.consumeToken()) {

		// Create a new game if necessary
		if(game === null) {
			game = new Game();
		}

		// Matching anything else different from a header means that the move section
		// is going to be parse => set-up the root node.
		if(stream.token !== TOKEN_HEADER && node === null) {
			initializeInitialPosition(stream, game, initialPositionFactory);
			node = game.mainVariation();
			nodeIsVariation = true;
		}

		// Token type switch
		switch(stream.token) {

			// Header
			case TOKEN_HEADER:
				if(node !== null) {
					throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.UNEXPECTED_PGN_HEADER);
				}
				processHeader(stream, game, initialPositionFactory, stream.tokenValue.key, stream.tokenValue.value);
				break;

			// Move or null-move
			case TOKEN_MOVE:
				try {
					node = node.play(stream.tokenValue);
					nodeIsVariation = false;
				}
				catch(error) {
					if(error instanceof exception.InvalidNotation) {
						throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.INVALID_MOVE_IN_PGN_TEXT, error.notation, error.message);
					}
					else {
						throw error;
					}
				}
				break;

			// NAG
			case TOKEN_NAG:
				node.addNag(stream.tokenValue);
				break;

			// Comment
			case TOKEN_COMMENT:
				for(var key in stream.tokenValue.tags) {
					if(stream.tokenValue.tags[key] !== undefined) {
						node.tag(key, stream.tokenValue.tags[key]);
					}
				}
				node.comment(stream.tokenValue.comment, stream.emptyLineFound);
				break;

			// Begin of variation
			case TOKEN_BEGIN_VARIATION:
				if(nodeIsVariation) {
					throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.UNEXPECTED_BEGIN_OF_VARIATION);
				}
				nodeStack.push(node);
				node = node.addVariation(stream.emptyLineFound);
				nodeIsVariation = true;
				break;

			// End of variation
			case TOKEN_END_VARIATION:
				if(nodeStack.length === 0) {
					throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.UNEXPECTED_END_OF_VARIATION);
				}
				node = nodeStack.pop();
				nodeIsVariation = false;
				break;

			// End-of-game
			case TOKEN_END_OF_GAME:
				if(nodeStack.length > 0) {
					throw new exception.InvalidPGN(stream.text, stream.tokenPos, i18n.UNEXPECTED_END_OF_GAME);
				}
				game.result(stream.tokenValue);
				return game;

		} // switch(token)

	} // while(consume(token()))

	if(game !== null) {
		throw new exception.InvalidPGN(stream.text, stream.text.length, i18n.UNEXPECTED_END_OF_TEXT);
	}
	return null;
}


/**
 * Skip 1 game in the given stream.
 *
 * @param {TokenStream} stream
 * @returns {boolean} `true` if a game has been skipped, false if the end of the stream has been reached.
 * @throws {module:exception.InvalidPGN}
 * @ignore
 */
function doSkipGame(stream) {
	while(stream.consumeToken()) {
		switch(stream.token) {
			case TOKEN_END_OF_GAME: return true;
		}
	}
	return false;
}


/**
 * PGN parsing function.
 *
 * @param {string} pgnString String to parse.
 * @returns {Game[]}
 * @throws {module:exception.InvalidPGN}
 *
 *//**
 *
 * PGN parsing function.
 *
 * @param {string} pgnString String to parse.
 * @param {number} gameIndex Only the game corresponding to this index is parsed.
 * @returns {Game}
 * @throws {module:exception.InvalidPGN}
 */
exports.pgnRead = function(pgnString, gameIndex) {
	var stream = new TokenStream(pgnString);

	// Parse all games...
	if(arguments.length === 1) {
		var result = [];
		while(true) {
			var currentGame = doParseGame(stream);
			if(currentGame === null) {
				return result;
			}
			result.push(currentGame);
		}
	}

	// Parse one game...
	else {
		var gameCounter = 0;
		while(gameCounter < gameIndex) {
			if(doSkipGame(stream)) {
				++gameCounter;
			}
			else {
				throw new exception.InvalidPGN(pgnString, -1, i18n.INVALID_GAME_INDEX, gameIndex, gameCounter);
			}
		}

		var result = doParseGame(stream);
		if(result === null) {
			throw new exception.InvalidPGN(pgnString, -1, i18n.INVALID_GAME_INDEX, gameIndex, gameCounter);
		}
		return result;
	}
};
