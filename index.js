// /* skale machine learning library */

// 'use strict';

// module.exports = require('./lib/ml.js');

// Copyright 2016 Luca-SAS, licensed under the Apache License 2.0

'use strict';

var thenify = require('thenify');
var Source = require('skale-engine').Source;

var ml = {};
module.exports = ml;

ml.StandardScaler = require('./lib/StandardScaler.js');
ml.BinaryClassificationMetrics = require('./lib/BinaryClassificationMetrics.js');
ml.LogisticRegressionWithSGD = require('./lib/LogisticRegressionWithSGD.js');

ml.randomSVMData = function (sc, N, D, seed, nPartitions) {
	function randomSVMLine(i, a, task) {
		var seed = i * (a.D + 1);
		var data = randn2(a.D + 1, seed);
		data[0] = Math.round(Math.abs(data[0])) * 2 - 1;
		return [data.shift(), data];

		function rand2(seed) {
			var x = Math.sin(seed) * 10000;
			return (x - Math.floor(x)) * 2 - 1;
		}

		function randn2(n, seed) {
			var a = new Array(n), i;
			for (i = 0; i < n; i++) a[i] = rand2(seed++);
			return a;
		}
	}
	return new Source(sc, N, randomSVMLine, {D: D, seed: seed}, nPartitions);
};

ml.randomSVMLine = function(rng, D) {
	var data = rng.randn(D + 1);
	data[0] = Math.round(Math.abs(data[0])) * 2 - 1;
	return [data.shift(), data];
};

/*
	Linear Models:
		- classification (logistic regression, SVM)
		- regression (least square, Lasso, ridge)
	NB:
		All those models can be trained using a stochastic gradient descent
		using different loss functions (logistic, hinge and squared) and different regularizers (Zero, L1, L2, elastic net)
*/

ml.LinearSVM = function (data, D, N, w) {
	var self = this;
	this.w = w || zeros(D);

	this.train = thenify(function(nIterations, callback) {
		var i = 0;
		iterate();

		function hingeLossGradient(p, args) {
			var grad = [], dot_prod = 0, label = p[0], features = p[1];
			for (var i = 0; i < features.length; i++)
				dot_prod += features[i] * args.weights[i];

			if (label * dot_prod < 1)
				for (var i = 0; i < features.length; i++) 
					grad[i] = -label * features[i];
			else
				for (var i = 0; i < features.length; i++) 
					grad[i] = 0;

			return grad;
		}

		function sum(a, b) {
			for (var i = 0; i < b.length; i++)
				a[i] += b[i];
			return a;
		}

		function iterate() {
			console.time(i);
			data.map(hingeLossGradient, {weights: self.w}).reduce(sum, zeros(D), function(err, gradient) {
				console.timeEnd(i);
				for (var j = 0; j < self.w.length; j++)
					self.w[j] -= gradient[j] / (N * Math.sqrt(i + 1));
				if (++i == nIterations) callback();
				else iterate();
			});
		}
	});
};

ml.LinearRegression = function (data, D, N, w) {
	var self = this;
	this.w = w || zeros(D);

	this.train = thenify(function(nIterations, callback) {
		var i = 0;
		iterate();

		function squaredLossGradient(p, args) {
			var grad = [], dot_prod = 0, label = p[0], features = p[1];
			for (var i = 0; i < features.length; i++)
				dot_prod += features[i] * args.weights[i];
			for (var i = 0; i < features.length; i++) 
				grad[i] = (dot_prod - label) * features[i];
			return grad;
		}

		function sum(a, b) {
			for (var i = 0; i < b.length; i++)
				a[i] += b[i];
			return a;
		}

		function iterate() {
			console.time(i);
			data.map(squaredLossGradient, {weights: self.w}).reduce(sum, zeros(D)).on('data', function(gradient) {
				console.timeEnd(i);
				for (var j = 0; j < self.w.length; j++)
					self.w[j] -= gradient[j] / (N * Math.sqrt(i + 1));
				if (++i == nIterations) callback();
				else iterate();
			});
		}
	});
};

// Decision tree basic unoptimized algorithm
// Begin ID3
// 	Load learning sets first, create decision tree root  node 'rootNode', add learning set S into root node as its subset.
// 	For rootNode, we compute Entropy(rootNode.subset) first
// 	If Entropy(rootNode.subset)==0, then 
// 		rootNode.subset consists of records all with the same value for the  categorical attribute, 
// 		return a leaf node with decision attribute:attribute value;
// 	If Entropy(rootNode.subset)!=0, then 
// 		compute information gain for each attribute left(have not been used in splitting), 
// 		find attribute A with Maximum(Gain(S,A)). 
// 		Create child nodes of this rootNode and add to rootNode in the decision tree. 
// 	For each child of the rootNode, apply 
// 		ID3(S,A,V) recursively until reach node that has entropy=0 or reach leaf node.
// End ID3	

ml.KMeans = function (data, nClusters, initMeans) {
	var seed = 1;
	var maxMse = 0.0000001;
	this.mse = [];
	this.means = initMeans;

	var D = initMeans ? initMeans[0].length : undefined ;
	var self = this;

	this.closestSpectralNorm = function (element, args) {
		var smallestSn = Infinity;
		var smallestSnIdx = 0;
		for (var i = 0; i < args.means.length; i++) {
			var sn = 0;
			for (var j = 0; j < element.length; j++)
				sn += Math.pow(element[1][j] - args.means[i][j], 2);
			if (sn < smallestSn) {
				smallestSnIdx = i;
				smallestSn = sn;
			}
		}
		return [smallestSnIdx, {data: element[1], sum: 1}];
	};

	this.train = thenify(function(nIterations, callback) {
		var i = 0;

		if (self.means === undefined) {
			console.time(i);
			data.takeSample(false, nClusters, seed, function(err, res) {
				console.timeEnd(i++);
				self.means = res;
				D = self.means[0].length;
				iterate();
			});
		} else iterate();

		function accumulate(a, b) {
			a.sum += b.sum;
			for (var i = 0; i < b.data.length; i++)
				a.data[i] += b.data[i];
			return a;
		}

		function iterate() {
			console.time(i);
			var newMeans = [];
			var res = data.map(self.closestSpectralNorm, {means: self.means})
				.reduceByKey(accumulate, {data: zeros(D), sum: 0})
				.map(function(a) {
					return a[1].data.map(function(e) {return e / a[1].sum;});
				}, [])
				.collect();
			res.on('data', function(data) {
				newMeans.push(data);
			});
			res.on('end',function(){
				console.timeEnd(i);
				var dist = 0;
				for (var k = 0; k < nClusters; k++)
					for (var j = 0; j < self.means[k].length; j++)
						dist += Math.pow(newMeans[k][j] - self.means[k][j], 2);
				self.means = newMeans;
				self.mse.push(dist);
				console.log('mse: ' + dist);
				if ((dist < maxMse) || (++i == nIterations)) callback();
				else iterate();
			});
		}
	});
};

function zeros(N) {
	var w = new Array(N);
	for (var i = 0; i < N; i++)
		w[i] = 0;
	return w;
}

/*
	Random(initSeed)
		Simple seeded random number generator
	Methods:
		- Random.next(): Generates a number x, so as -1 < x < 1
		- Random.reset(): Reset seed to initial seed value
*/
function Random(initSeed) {
	this.seed = initSeed || 1;

	this.next = function () {
	    var x = Math.sin(this.seed++) * 10000;
	    return (x - Math.floor(x)) * 2 - 1;
	};

	this.reset = function () {
		this.seed = initSeed;
	};

	this.randn = function (N) {
		var w = new Array(N);
		for (var i = 0; i < N; i++)
			w[i] = this.next();
		return w;
	};

	this.nextDouble = function () {
		return 0.5 * this.next() + 0.5;			// Must be uniform, not gaussian
	};
}

function Poisson(lambda, initSeed) {
	this.seed = initSeed || 1;

	var rng = new Random(initSeed);

	this.sample = function () {
		var L = Math.exp(-lambda), k = 0, p = 1;
		do {
			k++;
			p *= rng.nextDouble();
		} while (p > L);
		return k - 1;
	}
}

// Compute a checksum of an arbitrary object
function cksum(o) {
	var i, h = 0, s = o.toString(), len = s.length;
	for (i = 0; i < len; i++) {
		h = ((h << 5) - h) + s.charCodeAt(i);
		h = h & h;	// convert to 32 bit integer
	}
	return Math.abs(h);
}

ml.Random = Random;
ml.Poisson = Poisson;
ml.cksum = cksum;
ml.zeros = zeros;
