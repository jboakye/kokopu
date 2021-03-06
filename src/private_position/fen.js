/******************************************************************************
 *                                                                            *
 *    This file is part of Kokopu, a JavaScript chess library.                *
 *    Copyright (C) 2018-2020  Yoann Le Montagner <yo35 -at- melix.net>       *
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


var bt = require('../basetypes');
var exception = require('../exception');
var i18n = require('../i18n');

var impl = require('./impl');

var FEN_PIECE_SYMBOL = 'KkQqRrBbNnPp';


/**
 * Return a human-readable string representing the position. This string is multi-line,
 * and is intended to be displayed in a fixed-width font (similarly to an ASCII-art picture).
 */
exports.ascii = function(position) {

	// Board scanning
	var result = '+---+---+---+---+---+---+---+---+\n';
	for(var r=7; r>=0; --r) {
		for(var f=0; f<8; ++f) {
			var cp = position.board[r*16 + f];
			result += '| ' + (cp < 0 ? ' ' : FEN_PIECE_SYMBOL[cp]) + ' ';
		}
		result += '|\n';
		result += '+---+---+---+---+---+---+---+---+\n';
	}

	// Flags
	result += bt.colorToString(position.turn) + ' ' + castlingToString(position) + ' ' + enPassantToString(position);
	if(position.variant !== bt.REGULAR_CHESS) {
		result += ' (' + bt.variantToString(position.variant) + ')';
	}

	return result;
};


exports.getFEN = function(position, fiftyMoveClock, fullMoveNumber) {
	var result = '';

	// Board scanning
	for(var r=7; r>=0; --r) {
		var emptyCount = 0;
		for(var f=0; f<8; ++f) {
			var cp = position.board[r*16 + f];
			if(cp < 0) {
				++emptyCount;
			}
			else {
				if(emptyCount > 0) {
					result += emptyCount;
					emptyCount = 0;
				}
				result += FEN_PIECE_SYMBOL[cp];
			}
		}
		if(emptyCount > 0) {
			result += emptyCount;
		}
		if(r > 0) {
			result += '/';
		}
	}

	// Flags + additional move counters
	result += ' ' + bt.colorToString(position.turn) + ' ' + castlingToString(position) + ' ' + enPassantToString(position);
	result += ' ' + fiftyMoveClock + ' ' + fullMoveNumber;

	return result;
};


function castlingToString(position) {
	if(position.variant === bt.CHESS960) {
		var whiteFlags = '';
		var blackFlags = '';
		for(var file = 0; file < 8; ++file) {
			if(position.castling[bt.WHITE] & 1 << file) { whiteFlags += bt.fileToString(file); }
			if(position.castling[bt.BLACK] & 1 << file) { blackFlags += bt.fileToString(file); }
		}
		return whiteFlags === '' && blackFlags === '' ? '-' : whiteFlags.toUpperCase() + blackFlags;
	}
	else {
		var result = '';
		if(position.castling[bt.WHITE] & 1<<7) { result += 'K'; }
		if(position.castling[bt.WHITE] & 1<<0) { result += 'Q'; }
		if(position.castling[bt.BLACK] & 1<<7) { result += 'k'; }
		if(position.castling[bt.BLACK] & 1<<0) { result += 'q'; }
		return result === '' ? '-' : result;
	}
}


function enPassantToString(position) {
	return position.enPassant < 0 ? '-' : bt.fileToString(position.enPassant) + (position.turn===bt.WHITE ? '6' : '3');
}


exports.parseFEN = function(variant, fen, strict) {

	// Trim the input string and split it into 6 fields.
	fen = fen.replace(/^\s+|\s+$/g, '');
	var fields = fen.split(/\s+/);
	if(fields.length !== 6) {
		throw new exception.InvalidFEN(fen, i18n.WRONG_NUMBER_OF_FEN_FIELDS);
	}

	// The first field (that represents the board) is split in 8 sub-fields.
	var rankFields = fields[0].split('/');
	if(rankFields.length !== 8) {
		throw new exception.InvalidFEN(fen, i18n.WRONG_NUMBER_OF_SUBFIELDS_IN_BOARD_FIELD);
	}

	// Initialize the position
	var position = impl.makeEmpty(variant);
	position.legal = null;

	// Board parsing
	for(var r=7; r>=0; --r) {
		var rankField = rankFields[7-r];
		var i = 0;
		var f = 0;
		while(i<rankField.length && f<8) {
			var s = rankField[i];
			var cp = FEN_PIECE_SYMBOL.indexOf(s);

			// The current character is in the range [1-8] -> skip the corresponding number of squares.
			if(/^[1-8]$/.test(s)) {
				f += parseInt(s, 10);
			}

			// The current character corresponds to a colored piece symbol -> set the current square accordingly.
			else if(cp >= 0) {
				position.board[r*16 + f] = cp;
				++f;
			}

			// Otherwise -> parsing error.
			else {
				throw new exception.InvalidFEN(fen, i18n.UNEXPECTED_CHARACTER_IN_BOARD_FIELD, s);
			}

			// Increment the character counter.
			++i;
		}

		// Ensure that the current sub-field deals with all the squares of the current rank.
		if(i !== rankField.length || f !== 8) {
			throw new exception.InvalidFEN(fen, i18n.UNEXPECTED_END_OF_SUBFIELD_IN_BOARD_FIELD, i18n.ORDINALS[7-r]);
		}
	}

	// Turn parsing
	position.turn = bt.colorFromString(fields[1]);
	if(position.turn < 0) {
		throw new exception.InvalidFEN(fen, i18n.INVALID_TURN_FIELD);
	}

	// Castling rights parsing
	position.castling = variant === bt.CHESS960 ? castlingFromStringXFEN(fields[2], strict, position.board) :
		castlingFromStringFEN(fields[2], strict);
	if(position.castling === null) {
		throw new exception.InvalidFEN(fen, i18n.INVALID_CASTLING_FIELD);
	}

	// En-passant rights parsing
	var enPassantField = fields[3];
	if(enPassantField !== '-') {
		if(!/^[a-h][36]$/.test(enPassantField)) {
			throw new exception.InvalidFEN(fen, i18n.INVALID_EN_PASSANT_FIELD);
		}
		if(strict && ((enPassantField[1]==='3' && position.turn===bt.WHITE) || (enPassantField[1]==='6' && position.turn===bt.BLACK))) {
			throw new exception.InvalidFEN(fen, i18n.WRONG_RANK_IN_EN_PASSANT_FIELD);
		}
		position.enPassant = bt.fileFromString(enPassantField[0]);
	}

	// Move counting flags parsing
	var moveCountingRegExp = strict ? /^(?:0|[1-9][0-9]*)$/ : /^[0-9]+$/;
	if(!moveCountingRegExp.test(fields[4])) {
		throw new exception.InvalidFEN(fen, i18n.INVALID_MOVE_COUNTING_FIELD, i18n.ORDINALS[4]);
	}
	if(!moveCountingRegExp.test(fields[5])) {
		throw new exception.InvalidFEN(fen, i18n.INVALID_MOVE_COUNTING_FIELD, i18n.ORDINALS[5]);
	}
	return { position: position, fiftyMoveClock: parseInt(fields[4], 10), fullMoveNumber: parseInt(fields[5], 10) };
};


function castlingFromStringFEN(castling, strict) {
	var res = [0, 0];
	if(castling === '-') {
		return res;
	}
	if(!(strict ? /^K?Q?k?q?$/ : /^[KQkq]*$/).test(castling)) {
		return null;
	}
	if(castling.indexOf('K') >= 0) { res[bt.WHITE] |= 1<<7; }
	if(castling.indexOf('Q') >= 0) { res[bt.WHITE] |= 1<<0; }
	if(castling.indexOf('k') >= 0) { res[bt.BLACK] |= 1<<7; }
	if(castling.indexOf('q') >= 0) { res[bt.BLACK] |= 1<<0; }
	return res;
}


function castlingFromStringXFEN(castling, strict, board) {
	var result = [0, 0];
	if(castling === '-') {
		return result;
	}
	if(!(strict ? /^[A-H]{0,2}[a-h]{0,2}$/ : /^[A-Ha-hKQkq]*$/).test(castling)) {
		return null;
	}

	function searchQueenSideRook(color) {
		var rookFile = -1;
		var targetRook = bt.ROOK * 2 + color;
		var targetKing = bt.KING * 2 + color;
		for(var sq = 112*color; sq < 112*color + 8; ++sq) {
			if(board[sq] === targetRook) {
				if(rookFile >= 0) { break; }
				rookFile = sq % 8;
			}
			else if(board[sq] === targetKing) {
				if(rookFile < 0) { break; }
				result[color] |= 1 << rookFile;
				return true;
			}
		}
		return false;
	}

	function searchKingSideRook(color) {
		var rookFile = -1;
		var targetRook = bt.ROOK * 2 + color;
		var targetKing = bt.KING * 2 + color;
		for(var sq = 112*color + 7; sq >= 112*color; --sq) {
			if(board[sq] === targetRook) {
				if(rookFile >= 0) { break; }
				rookFile = sq % 8;
			}
			else if(board[sq] === targetKing) {
				if(rookFile < 0) { break; }
				result[color] |= 1 << rookFile;
				return true;
			}
		}
		return false;
	}

	if(castling.indexOf('K') >= 0) { if(!searchKingSideRook (bt.WHITE)) { return null; }}
	if(castling.indexOf('Q') >= 0) { if(!searchQueenSideRook(bt.WHITE)) { return null; }}
	if(castling.indexOf('k') >= 0) { if(!searchKingSideRook (bt.BLACK)) { return null; }}
	if(castling.indexOf('q') >= 0) { if(!searchQueenSideRook(bt.BLACK)) { return null; }}

	for(var file = 0; file < 8; ++file) {
		var s = bt.fileToString(file);
		if(castling.indexOf(s.toUpperCase()) >= 0) { result[bt.WHITE] |= 1 << file; }
		if(castling.indexOf(s              ) >= 0) { result[bt.BLACK] |= 1 << file; }
	}
	return result;
}
