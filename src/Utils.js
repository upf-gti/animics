import { MiniGLTFLoader } from "./loaders/GLTFLoader.js";

/*
	Some utils
*/

const CompareEqual = (v, p, n) => { return v !== p || v !== n };
const CompareThreshold = (v, p, n, t) => { return Math.abs(v - p) >= t || Math.abs(v - n) >= t };
const CompareThresholdRange = (v0, v1, t0, t1) => { return v0 > t0 && v0 <= t1 || v1 > t0 && v1 <= t1 };
const HexToRgb = (hex) => {
    var c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255];
    }
    throw new Error('Bad Hex');
}

const UTILS = {
	deg2rad: Math.PI / 180,
	rad2deg: 180 / Math.PI,
	
	getTime() {
		return new Date().getTime();
	},

	getExtension(s) {
		return s.substr(s.lastIndexOf(".") + 1);
	},

	removeExtension(s) {
		return s.substr(0, s.lastIndexOf("."));
	},
	
	firstToUpperCase(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	},
	
	concatTypedArray(arrays, ArrayType){
		let size = arrays.reduce((acc,arr) => acc + arr.length, 0);
		let result = new ArrayType( size ); // generate just one array
		let offset = 0;
		for( let i = 0; i < arrays.length; ++i ){
			result.set(arrays[i], offset ); // copy values
			offset += arrays[i].length;
		}
		return result;
	},

	// Function to find consecutive ranges
	consecutiveRanges(a) {
		let length = 1;
		let list = [];
	
		// If the array is empty, return the list
		if (a.length == 0)
			return list;

		for (let i = 1; i <= a.length; i++) {
			// Check the difference between the current and the previous elements. If the difference doesn't equal to 1 just increment the length variable.
			if (i == a.length || a[i] - a[i - 1] != 1) {
				// If the range contains only one element. Add it into the list.
				if (length == 1) {
					list.push((a[i - length]));
				}
				else {
					// Build the range between the first element of the range and the current previous element as the last range.
					list.push([a[i - length], a[i - 1]]);
				}
				// After finding the first range initialize the length by 1 to build the next range.
				length = 1;
			}
			else {
				length++;
			}
		}
		return list;
	},

	loadGLTF(animationFile, onLoaded) {
        const modelName = animationFile.split("/");
        this.makeLoading("Loading GLTF [" + modelName[modelName.length - 1] +"]...")
        const gltfLoader = new MiniGLTFLoader();

        // if(typeof(Worker) !== 'undefined') {
        //     const worker = new Worker("src/workers/loader.js?filename=" + animationFile, { type: "module" });
        //     worker.onmessage = function (event) {
        //         gltfLoader.parse(event.data, animationFile, onLoaded);
        //         worker.terminate();
        //     };
        // } else {
            // browser does not support Web Workers
            // call regular load function
            gltfLoader.load( animationFile, onLoaded );
        // }
    },

	/**
	 * 
	 * @param {float} targetOpacity 
	 * @param {float} fadeTime 
	 * @param {bool} adaptTime if true, fadeTime is the time it takes to transition from 0 to 1. Final fading time will be computed using the current state opacity
	 * @returns 
	 */
	fadeAnimation( element, targetOpacity, fadeTime, adaptTime = true ){
		let anims = element.getAnimations({subtree: true});

		for( let i = 0; i < anims.length; ++i ){
			const a = anims[i];
			if (a.isOpacityFade){
				// css animations do not update element.style properties
				// sets current animation state into the element style properties
				a.commitStyles(); 

				// will automatically remove itself from the list
				a.finish();
				break;
			}
		}
		if ( adaptTime ){
			let elop = parseFloat(element.style.opacity);
			if ( isNaN(elop) ){
				elop = 1;
			}
			fadeTime = fadeTime * Math.abs( elop - targetOpacity );
		}

		const newAnim = element.animate([ {opacity: element.style.opacity}, {opacity: targetOpacity}], {duration:fadeTime, iterations: 1}); //
		newAnim.isOpacityFade = true;
		element.style.opacity = targetOpacity; // set the state it will have after the animation ends
		return newAnim;
	},

	makeLoading( string, opacity = 1){
		const loading = document.getElementById("loading");
		loading.classList.remove("hidden");
		loading.getElementsByTagName("p")[0].innerText = string;
		return this.fadeAnimation( loading, opacity, 200, true );
	},

	hideLoading ( ){
		const loading = document.getElementById("loading");
		const anim = this.fadeAnimation( loading, 0, 200, true );
		anim.onfinish = ()=>{ loading.classList.add("hidden"); }
	},
	
	// Function to download data to a file
	download: function(data, filename, type = "text/plain") {
        let file = new Blob([data], {type: type});
        if (window.navigator.msSaveOrOpenBlob) // IE10+
            window.navigator.msSaveOrOpenBlob(file, filename);
        else { // Others
            let a = document.createElement("a");
            let url = URL.createObjectURL(file);
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(function() {
                window.URL.revokeObjectURL(url);  
            }, 0); 
        }
    },

	dataToFile: function(data, filename, type = "text/plain") {
		const file = new Blob([data], {type: type});
		return file;
	},

	blobToBase64(blob) {
		return new Promise( resolve => {
			let reader = new FileReader();
			reader.onload = function() {
				let dataUrl = reader.result;
				let base64 = dataUrl.split(',')[1]; // readAsDataUrl returns a "data:*/*;base64" + the data as base64. Removing the header
				resolve(base64);
			};
			reader.readAsDataURL(blob);
		});
	}
};

const ShaderChunk = {

	Point: {
		vertexshader: `

			attribute float size;
			attribute vec3 color;

			varying vec3 vColor;

			void main() {

				vColor = color;

				vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

				gl_PointSize = size * ( 300.0 / -mvPosition.z );

				gl_Position = projectionMatrix * mvPosition;

			}

		`,

		fragmentshader: `

			uniform vec3 color;
			uniform sampler2D pointTexture;
			uniform float alphaTest;

			varying vec3 vColor;

			void main() {

				gl_FragColor = vec4( color * vColor, 1.0 );

				gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );

				if ( gl_FragColor.a < alphaTest ) discard;

			}

		`
	}

};

export { UTILS, ShaderChunk, CompareThreshold, CompareThresholdRange, HexToRgb }