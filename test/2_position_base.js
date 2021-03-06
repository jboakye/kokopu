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


var kokopu = require('../index');
var test = require('unit.js');
var readCSV = require('./common/readcsv');

var startFEN  = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
var startXFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w AHah - 0 1';
var emptyFEN  = '8/8/8/8/8/8/8/8 w - - 0 1';
var customFEN = 'k7/n1PB4/1K6/8/8/8/8/8 w - - 0 1';

var builders = [
	{ label: 'regular', make: function() { return new kokopu.Position(customFEN); } },
	{ label: 'Chess960', make: function() { return new kokopu.Position('chess960', customFEN); } }
];


describe('Position constructor', function() {

	function doTest(label, expectedVariant, expectedFEN, positionFactory) {
		it(label, function() {
			var position = positionFactory();
			test.value(position.variant()).is(expectedVariant);
			test.value(position.fen()).is(expectedFEN);
		});
	}

	doTest('Default constructor'  , 'regular', startFEN , function() { return new kokopu.Position(); });
	doTest('Constructor \'start\'', 'regular', startFEN , function() { return new kokopu.Position('start'); });
	doTest('Constructor \'empty\'', 'regular', emptyFEN , function() { return new kokopu.Position('empty'); });
	doTest('Constructor FEN-based', 'regular', customFEN, function() { return new kokopu.Position(customFEN); });

	doTest('Default constructor (force regular)'  , 'regular', startFEN , function() { return new kokopu.Position('regular'); });
	doTest('Constructor \'start\' (force regular)', 'regular', startFEN , function() { return new kokopu.Position('regular', 'start'); });
	doTest('Constructor \'empty\' (force regular)', 'regular', emptyFEN , function() { return new kokopu.Position('regular', 'empty'); });
	doTest('Constructor FEN-based (force regular)', 'regular', customFEN, function() { return new kokopu.Position('regular', customFEN); });

	doTest('Scharnagl constructor'                 , 'chess960', startXFEN, function() { return new kokopu.Position('chess960', 518); });
	doTest('Constructor \'empty\' (force Chess960)', 'chess960', emptyFEN , function() { return new kokopu.Position('chess960', 'empty'); });
	doTest('Constructor FEN-based (force Chess960)', 'chess960', customFEN, function() { return new kokopu.Position('chess960', customFEN); });
});


describe('Position copy constructor', function() {
	builders.forEach(function(builder) {
		it('Copy from ' + builder.label, function() {

			// Initialize the positions.
			var p1 = builder.make();
			var expectedVariant = p1.variant();
			var p2 = new kokopu.Position(p1);
			p1.clear(expectedVariant);

			// Check their states
			test.value(p1.variant()).is(expectedVariant);
			test.value(p2.variant()).is(expectedVariant);
			test.value(p1.fen()).is(emptyFEN);
			test.value(p2.fen()).is(customFEN);
		});
	});
});


describe('Clear mutator', function() {
	builders.forEach(function(builder) {

		it('From ' + builder.label + ' to default', function() {
			var position = builder.make();
			position.clear();
			test.value(position.variant()).is('regular');
			test.value(position.fen()).is(emptyFEN);
		});

		it('From ' + builder.label + ' to regular', function() {
			var position = builder.make();
			position.clear('regular');
			test.value(position.variant()).is('regular');
			test.value(position.fen()).is(emptyFEN);
		});

		it('From ' + builder.label + ' to Chess960', function() {
			var position = builder.make();
			position.clear('chess960');
			test.value(position.variant()).is('chess960');
			test.value(position.fen()).is(emptyFEN);
		});

	});
});


describe('Reset mutator', function() {
	builders.forEach(function(builder) {
		it('From ' + builder.label, function() {
			var position = builder.make();
			position.reset();
			test.value(position.variant()).is('regular');
			test.value(position.fen()).is(startFEN);
		});
	});
});


describe('Reset 960 mutator', function() {
	builders.forEach(function(builder) {
		it('From ' + builder.label, function() {
			var position = builder.make();
			position.reset960(518);
			test.value(position.variant()).is('chess960');
			test.value(position.fen()).is(startXFEN);
		});
	});
});


describe('Position Scharnagl constructor', function() {

	var testData = readCSV('scharnagl.csv', function(fields) {
		return {
			scharnaglCode: parseInt(fields[0]),
			fen: fields[3]
		};
	});

	testData.forEach(function(elem) {
		it('Chess960 initial position ' + elem.scharnaglCode, function() {
			var position = new kokopu.Position('chess960', elem.scharnaglCode);
			test.value(position.variant()).is('chess960');
			test.value(position.fen()).is(elem.fen);
		});
	});
});


describe('Position getters', function() {

	var currentFEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b Kk e3 0 1';

	it('Get board 1', function() { var p=new kokopu.Position(); test.value(p.square('e1')).is('wk'); });
	it('Get board 2', function() { var p=new kokopu.Position(); test.value(p.square('f7')).is('bp'); });
	it('Get board 3', function() { var p=new kokopu.Position(); test.value(p.square('b4')).is('-'); });

	it('Get turn 1', function() { var p=new kokopu.Position(); test.value(p.turn()).is('w'); });
	it('Get turn 2', function() { var p=new kokopu.Position(currentFEN); test.value(p.turn()).is('b'); });

	it('Get castling 1', function() { var p=new kokopu.Position(); test.value(p.castling('wq')).is(true); });
	it('Get castling 2', function() { var p=new kokopu.Position(currentFEN); test.value(p.castling('bq')).is(false); });
	it('Get castling 3', function() { var p=new kokopu.Position(currentFEN); test.value(p.castling('bk')).is(true); });
	it('Get castling 4 (Chess960)', function() { var p=new kokopu.Position('chess960', 763); test.value(p.castling('wa')).is(true); });
	it('Get castling 5 (Chess960)', function() { var p=new kokopu.Position('chess960', 763); test.value(p.castling('wb')).is(false); });
	it('Get castling 6 (Chess960)', function() { var p=new kokopu.Position('chess960', 763); test.value(p.castling('bf')).is(true); });
	it('Get castling 7 (Chess960)', function() { var p=new kokopu.Position('chess960', 763); test.value(p.castling('bh')).is(false); });

	it('Get en-passant 1', function() { var p=new kokopu.Position(); test.value(p.enPassant()).is('-'); });
	it('Get en-passant 2', function() { var p=new kokopu.Position(currentFEN); test.value(p.enPassant()).is('e'); });

	['j1', 'f9'].forEach(function(elem) {
		it('Error for board with ' + elem, function() {
			var p=new kokopu.Position();
			test.exception(function() { p.square(elem); }).isInstanceOf(kokopu.exception.IllegalArgument);
		});
	});

	['bK', 'wa'].forEach(function(elem) {
		it('Error for castling with ' + elem, function() {
			var p=new kokopu.Position();
			test.exception(function() { p.castling(elem); }).isInstanceOf(kokopu.exception.IllegalArgument);
		});
	});
});


describe('Position setters', function() {

	var pos1 = new kokopu.Position('start');
	var pos2 = new kokopu.Position('empty');
	var pos3 = new kokopu.Position('chess960', 763);

	it('Set board 1a', function() { pos1.square('a8', '-'); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); });
	it('Set board 1b', function() { pos1.square('f6', 'wb'); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); });

	it('Set board 2a', function() { pos2.square('c3', 'bk'); test.value(pos2.fen()).is('8/8/8/8/8/2k5/8/8 w - - 0 1'); });
	it('Set board 2b', function() { pos2.square('g5', 'wk'); test.value(pos2.fen()).is('8/8/8/6K1/8/2k5/8/8 w - - 0 1'); });
	it('Set board 2c', function() { pos2.square('c3', '-'); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 w - - 0 1'); });

	it('Set turn 1', function() { pos1.turn('w'); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); });
	it('Set turn 2', function() { pos2.turn('b'); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 b - - 0 1'); });

	it('Set castling 1a', function() { pos1.castling('wk', false); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1'); });
	it('Set castling 1b', function() { pos1.castling('bk', true ); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1'); });
	it('Set castling 2a', function() { pos2.castling('wq', false); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 b - - 0 1'); });
	it('Set castling 2b', function() { pos2.castling('bq', true ); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 b q - 0 1'); });
	it('Set castling 3a (Chess960)', function() { pos3.castling('wa', false); test.value(pos3.fen()).is('rknnbrqb/pppppppp/8/8/8/8/PPPPPPPP/RKNNBRQB w Faf - 0 1'); });
	it('Set castling 3b (Chess960)', function() { pos3.castling('wh', true ); test.value(pos3.fen()).is('rknnbrqb/pppppppp/8/8/8/8/PPPPPPPP/RKNNBRQB w FHaf - 0 1'); });
	it('Set castling 3c (Chess960)', function() { pos3.castling('bd', true ); test.value(pos3.fen()).is('rknnbrqb/pppppppp/8/8/8/8/PPPPPPPP/RKNNBRQB w FHadf - 0 1'); });
	it('Set castling 3d (Chess960)', function() { pos3.castling('bf', false); test.value(pos3.fen()).is('rknnbrqb/pppppppp/8/8/8/8/PPPPPPPP/RKNNBRQB w FHad - 0 1'); });

	it('Set en-passant 1a', function() { pos1.enPassant('e'); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w Qkq e6 0 1'); });
	it('Set en-passant 1b', function() { pos1.enPassant('-'); test.value(pos1.fen()).is('1nbqkbnr/pppppppp/5B2/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1'); });
	it('Set en-passant 2a', function() { pos2.enPassant('a'); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 b q a3 0 1'); });
	it('Set en-passant 2b', function() { pos2.enPassant('h'); test.value(pos2.fen()).is('8/8/8/6K1/8/8/8/8 b q h3 0 1'); });
});
