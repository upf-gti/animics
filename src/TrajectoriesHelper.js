import * as THREE from 'three'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';

// Shared arrow geometry
const SHARED_CONE_GEO = new THREE.ConeGeometry(1, 1, 3).rotateX(Math.PI / 2).translate(0, 0, -0.5);

class TrajectoriesHelper {
    constructor( object, mixer ) {
        this.mixer = mixer;        
        this.object = object;

        // Temporal objects to avoid Garbage Collection
        this._tmpMat4 = new THREE.Matrix4();
        this._tmpPos = new THREE.Vector3();
        this._tmpLastPos = new THREE.Vector3();
        this._tmpQuat1 = new THREE.Quaternion();
        this._tmpQuat2 = new THREE.Quaternion();
        this._tmpColor = new THREE.Color();

        this.trajectories = {
            "LeftHand": new THREE.Group( { name: "LeftHand", thickness: 8 }),
            "LeftHandThumb4": new THREE.Group( { name: "LeftHandThumb4", thickness: 6, color: new THREE.Color("#51A3A3") } ),
            "LeftHandIndex4": new THREE.Group( { name: "LeftHandIndex4", thickness: 6, color: new THREE.Color("#75485E")} ),
            "LeftHandMiddle4": new THREE.Group( { name: "LeftHandMiddle4", thickness: 6, color: new THREE.Color("#CB904D") } ),
            "LeftHandRing4": new THREE.Group( { name: "LeftHandRing4", thickness: 6, color: new THREE.Color("#DFCC74") } ),
            "LeftHandPinky4": new THREE.Group( { name: "LeftHandPinky4", thickness: 6, color: new THREE.Color("#C3E991") } ),
            "RightHand": new THREE.Group( { name: "RightHand", thickness: 8 } ),
            "RightHandThumb4": new THREE.Group( { name: "RightHandThumb4", thickness: 6, color: new THREE.Color("#51A3A3")} ),
            "RightHandIndex4": new THREE.Group( { name: "RightHandIndex4", thickness: 6, color: new THREE.Color("#75485E") } ),
            "RightHandMiddle4": new THREE.Group( { name: "RightHandMiddle4", thickness: 6, color: new THREE.Color("#CB904D") } ),
            "RightHandRing4": new THREE.Group( { name: "RightHandRing4", thickness: 6, color: new THREE.Color("#DFCC74") } ),
            "RightHandPinky4": new THREE.Group( { name: "RightHandPinky4", thickness: 6, color: new THREE.Color("#C3E991") } ),
        }

        const colorMap = {
            "Thumb": "#51A3A3",
            "Index": "#75485E",
            "Middle": "#CB904D",
            "Ring": "#DFCC74",
            "Pinky": "#C3E991"
        };

        for( const t in this.trajectories) {
            this.trajectories[t].thickness = 6;
            let matched = false;
            for(const key in colorMap) {
                if(t.includes(key)) {
                    this.trajectories[t].color = new THREE.Color(colorMap[key]);
                    matched = true;
                    break;
                }
            }
            if(!matched) {
                this.trajectories[t].thickness = 8;
            }
            this.trajectories[t].layers.set(2);
        }
        this.trajectoryStart = 0;
        this.trajectoryEnd = 100;
    }
    
    buildTrajectories( trajectoriesNames, times, data = {}, isRecompute = false) {
        const mixer = data.mixer || this.mixer;
        const startFrame = data.startFrame || 0;
        const endFrame = data.endFrame || times.length - 1;
        const startTime = data.startTime || times[startFrame];
        const endTime = data.endTime || times[endFrame];
        const originalTime = data.currentTime || mixer.time;

        let totalFramesLoop = 0;
        
        const trajectoryData = {};
        
        trajectoriesNames.forEach( name => {
            
            const trajectory = this.trajectories[name];
            if( !trajectory ) {
                return;
            }
  
            const bone = this.object.getObjectByName(trajectory.name);
            const isHand = name === "LeftHand" || name === "RightHand";
            
            let rootFinger = trajectory.rootFinger || null;
            if (!isHand && bone && !rootFinger) {
                let current = bone;
                let n = current.name.replace("mixamorig", "").replaceAll("_", "").replaceAll(":", "");
                while (current && !n.includes("1")) {
                    current = current.parent;
                    if (current) n = current.name.replace("mixamorig", "").replaceAll("_", "").replaceAll(":", "");
                }
                rootFinger = current;
                trajectory.rootFinger = rootFinger;
            }

            // Add trajectories to the scene objects
            if (rootFinger && !trajectory.parent) {
                rootFinger.add(trajectory);
            }
            else if (isHand && !trajectory.parent) {
                this.object.add(trajectory);
            }

            const arrowMap = {};
            if (isRecompute) {
                const childrenCopy = [...trajectory.children];
                for (let i = 0; i < childrenCopy.length; i++) {
                    if (childrenCopy[i].name !== "line") {
                        trajectory.remove(childrenCopy[i]);
                        // arrowMap[childrenCopy[i].name] = childrenCopy[i];
                    }
                }
            }

            trajectoryData[name] = {
                bone: bone,
                rootFinger: rootFinger,
                isHand: isHand,
                positions: isRecompute ? trajectory.positions : [],
                colors: isRecompute ? trajectory.colors : [],
                arrowMap: arrowMap,
                p3: bone?.parent?.parent?.parent,
                p2: bone?.parent?.parent,
                lastPos: isRecompute 
                    ? this._tmpLastPos.set(trajectory.positions[startFrame * 3 - 3] || 0, trajectory.positions[startFrame * 3 - 2] || 0, trajectory.positions[startFrame * 3 - 1] || 0)
                    : new THREE.Vector3()
            };
            totalFramesLoop = isRecompute ? (trajectory.positions.length / 3) : (times.length - 1);
        })

        if (isRecompute) {
            mixer.setTime(0);
            mixer.update(0);
        }

        let gradIdx = -1;
        let maxGradient = [1.0001, 0];
        let g0 = [0, 0];
        let g1 = data.gradient ? data.gradient[0] : 0;

        // Processing Phase
        const mat4 = this._tmpMat4;
        const pos = this._tmpPos;
        const parentRot = new THREE.Quaternion();
        const boneRot = new THREE.Quaternion();

        for (let t = 0; t < totalFramesLoop; t++) {
            const time = times[t];
            
            // Update mixer and force a full skeleton matrix update
            mixer.setTime(time / mixer.timeScale);

            this.object.updateWorldMatrix(true, true);

            trajectoriesNames.forEach( name => {
                const trajectory = trajectoryData[name];
                if (!trajectory || !trajectory.bone) {
                    return;
                }
                
                trajectory.bone.updateWorldMatrix(true, false);

                // Convert world to local positions
                if (trajectory.isHand) {
                    pos.setFromMatrixPosition(trajectory.bone.matrixWorld);
                }
                else {
                    if (!trajectory.rootFinger) return;
                    mat4.copy(trajectory.rootFinger.matrixWorld).invert().multiply(trajectory.bone.matrixWorld);
                    pos.setFromMatrixPosition(mat4);
                }

                // Save positions
                if (isRecompute) {
                    const t3 = t * 3;
                    this.trajectories[name].positions[t3] = pos.x;
                    this.trajectories[name].positions[t3 + 1] = pos.y;
                    this.trajectories[name].positions[t3 + 2] = pos.z;
                }
                else {
                    trajectory.positions.push(pos.x, pos.y, pos.z);
                }

                // Compute opacity given a gradient
                let alpha = 0.8;
                if (data.gradient) {
                    let value = (times[t] - startTime) / (endTime - startTime); 
                    while (value > g1[0]) {
                        g0 = g1;
                        g1 = data.gradient[++gradIdx];
                        if (!g1) { g1 = maxGradient; break; }
                    }
                    value = (value - g0[0]) / (g1[0] - g0[0]);
                    value = g0[1] * (1 - value) + g1[1] * value;
                    alpha = value;
                }
                const opacity = Math.max(0, Math.min(1, alpha));

                let c = this.trajectories[name].color;
                if (!c) {
                    c = this._tmpColor.set(`hsl(${180 * Math.sin(time / Math.PI)}, 100%, 50%)`);
                }

                if (isRecompute) {
                    const t8 = t * 8;
                    this.trajectories[name].colors[t8] = c.r;
                    this.trajectories[name].colors[t8 + 1] = c.g;
                    this.trajectories[name].colors[t8 + 2] = c.b;
                    this.trajectories[name].colors[t8 + 3] = opacity;
                    this.trajectories[name].colors[t8 + 4] = c.r;
                    this.trajectories[name].colors[t8 + 5] = c.g;
                    this.trajectories[name].colors[t8 + 6] = c.b;
                    this.trajectories[name].colors[t8 + 7] = opacity;

                    if (t > 0) {
                        // Reuse arrows intances
                        let arrow = trajectory.arrowMap[t - 1];
                        if (arrow) {
                            const ix = trajectory.lastPos.x, iy = trajectory.lastPos.y, iz = trajectory.lastPos.z;
                            const fx = pos.x, fy = pos.y, fz = pos.z;
                            const length = Math.sqrt( (ix-fx)**2 + (iy-fy)**2 + (iz-fz)**2 );
                            arrow.position.set(trajectory.lastPos.x, trajectory.lastPos.y, trajectory.lastPos.z);
                            arrow.lookAt(pos.x, pos.y, pos.z);
                            arrow.visible = opacity > 0;
                            arrow.children[0].material.opacity = opacity;
                            arrow.children[0].position.set(0, 0, length);
                        }
                        else {
                            arrow = customArrow(pos.x, pos.y, pos.z, trajectory.lastPos.x, trajectory.lastPos.y, trajectory.lastPos.z, this.trajectories[name].thickness * 0.0002, c);
                            if (arrow) {
                                arrow.name = t - 1;
                                arrow.layers.set(2);
                                arrow.visible = opacity > 0;
                                arrow.children[0].material.opacity = opacity;
                                this.trajectories[name].add(arrow);
                            }
                        }
                    }
                }
                else {
                    trajectory.colors.push(c.r, c.g, c.b, opacity);
                    trajectory.colors.push(c.r, c.g, c.b, opacity);
                    
                    if (t > 0) {
                        const arrow = customArrow(pos.x, pos.y, pos.z, trajectory.lastPos.x, trajectory.lastPos.y, trajectory.lastPos.z, this.trajectories[name].thickness * 0.0002, c);
                        if (arrow) {
                            arrow.name = t - 1;
                            arrow.layers.set(2);
                            arrow.visible = opacity > 0;
                            arrow.children[0].material.opacity = opacity;
                            this.trajectories[name].add(arrow);
                        }
                    }
                }

                trajectory.lastPos.copy(pos);

            //     // Recompute quaternions
            //     if (isRecompute && data.offsetRotParent && trajectory.p3) {
            //         trajectory.p3.updateWorldMatrix(true, false);
            //         trajectory.p3.getWorldQuaternion(this._tmpQuat1);
            //         this._tmpQuat1.premultiply(data.offsetRotParent.clone().invert()); 
            //         trajectory.p3.parent.updateWorldMatrix(true, false);
            //         trajectory.p3.parent.getWorldQuaternion(this._tmpQuat2).invert();
            //         trajectory.p3.quaternion.copy(this._tmpQuat1.premultiply(this._tmpQuat2));
            //     }
            //     if (isRecompute && data.offsetRot && trajectory.p2 && trajectory.p3) {
            //         trajectory.p2.updateWorldMatrix(true, false);
            //         trajectory.p2.getWorldQuaternion(this._tmpQuat1);
            //         this._tmpQuat1.premultiply(data.offsetRot.clone().invert());
            //         trajectory.p3.updateWorldMatrix(true, false);
            //         trajectory.p3.getWorldQuaternion(this._tmpQuat2).invert();
            //         trajectory.p2.quaternion.copy(this._tmpQuat1.premultiply(this._tmpQuat2));
            //     }
            })
        }

        // Create/Update line meshes (trajectories): geometries
        trajectoriesNames.forEach( name => {
            const trajectory = this.trajectories[name];
            if( !trajectory ) {
                return;
            }
            if (isRecompute) {
                const line = trajectory.getObjectByName("line");
                if (line) {
                    line.geometry.setPositions(trajectory.positions);
                    line.geometry.setColors(trajectory.colors);
                    line.material.needsUpdate = true;
                }
            }
            else {
                const tData = trajectoryData[name];
                const geometry = new MagicLineGeometry();
                geometry.setPositions(tData.positions);
                geometry.setColors(tData.colors);
                
                const material = new LineMaterial({
                    vertexColors: true,
                    alphaToCoverage: true,
                    linewidth: trajectory.thickness,
                    vertexShader: vertexShader,
                    fragmentShader: fragmentShader,
                    transparent: true
                });
                material.defines = material.defines || {};
                material.defines.USE_COLOR_ALPHA = "";
                material.resolution.set(window.innerWidth, window.innerHeight);

                const line = new Line2(geometry, material);
                line.name = "line";
                trajectory.add(line);
                
                trajectory.positions = tData.positions;
                trajectory.colors = tData.colors;
            }
        })
        
        // Restore animation state
        mixer.setTime(originalTime);
        this.object.updateWorldMatrix(true, true);
    }

    computeTrajectories(animation, data = {}) {
        this.dispose(); 
        const rootTrack = animation.tracks[0];
        this.trajectoryEnd = rootTrack.times.length;
        const trajectoryKeys = Object.keys(this.trajectories);

        // Init map tracks-bones
        for (let trajectory of trajectoryKeys) {
            for (let track of animation.tracks) {
                const name = track.name || track.groupId;
                if (name.includes(trajectory + ".") || name.includes(trajectory.replace("4", "EndSite") + ".") || name.replace("mixamorig_", "") == trajectory) {
                    this.trajectories[trajectory].name = name.replace(".quaternion", "");
                    break;
                }
            }
        }
        this.buildTrajectories(trajectoryKeys, rootTrack.times, data, false);
    }

    recomputeTrajectories( trajectories, times, data = {}) {      
        this.buildTrajectories(trajectories, times, data, true);
    }

    updateTrajectories( startTime, endTime, gradient = false ) {
        const mixer = this.mixer;
        const action = mixer._actions[0];
        if( !action ) return;

        // Get start frame index
        const startFrame = getFrameIndex(action, startTime);
        this.trajectoryStart = startFrame;
        
        // Get end frame index
        const endFrame = getFrameIndex(action, endTime);
        this.trajectoryEnd = endFrame;
    
        const times = action.getClip().tracks[0].times;

        // Update material alpha for each trajectory (line and arrows)
        for( let trajectory in this.trajectories ) {
            const currentTraj = this.trajectories[trajectory];
            const positions = currentTraj.positions;
            if (!positions || positions.length < 6) continue;

            let colors = currentTraj.colors;
            const totalFrames = positions.length / 3;
            
            const line = currentTraj.getObjectByName("line");
            if(!line) continue;

            const arrowMap = {};
            const children = currentTraj.children;
            for(let i = 0; i < children.length; i++) {
                if(children[i].name !== "line") {
                    arrowMap[children[i].name] = children[i];
                }
            }

            let gradIdx = -1;
            let maxGradient = [1.0001, 0];
            let g0 = [0, 0];
            let g1 = gradient ? gradient[0] : 0;

            for(let frame = 0; frame < totalFrames; frame++) {
                let alpha = 0.8;
                if( frame < startFrame ) {
                    alpha = (frame - startFrame) / 10;
                }
                else if( frame > endFrame ) {
                    alpha = (endFrame - frame) / 10;
                }
                else if (gradient){
                    let t = (times[frame] - startTime) / (endTime - startTime); // normalize time in window
                    // Find next valid gradient interval
                    while( t > g1[0] ){
                        g0 = g1;
                        g1 = gradient[++gradIdx];
                        if ( !g1 ){ g1 = maxGradient; break; }
                    }
                    // Compute delta factor
                    t = (t - g0[0]) / (g1[0] - g0[0]);
                    alpha = g0[1] * (1 - t) + g1[1] * t;
                }
                
                const opacity = Math.max(0, Math.min(1, alpha));
                const f8 = frame * 8;
                colors[f8 + 3] = opacity;
                colors[f8 + 7] = opacity;
                
                const arrow = arrowMap[frame];
                // Update arrow visibility
                if (arrow) {
                    arrow.children[0].material.opacity = opacity;
                    arrow.visible = opacity > 0;
                }
            }

            line.geometry.setColors(colors);
        }
    }

    show( trajectory ) {
        if( trajectory ) {
            if(this.trajectories[trajectory]) {
                this.trajectories[trajectory].visible = true;
            }
            return;
        }
        for( let t in this.trajectories ) this.trajectories[t].visible = true;
    }

    hide( trajectory ) {
        if( trajectory ) {
            if(this.trajectories[trajectory]) {
                this.trajectories[trajectory].visible = false;
            }
            return;
        }
        for( let t in this.trajectories ) this.trajectories[t].visible = false;
    }

    dispose(){
        for( const t in this.trajectories ){
            this.trajectories[t].traverse( (obj) =>{
                if ( obj.geometry ) obj.geometry.dispose();
                if ( obj.material ) obj.material.dispose();
            });
            this.trajectories[t].clear();
            this.trajectories[t].removeFromParent();
        }
    }
}

const getFrameIndex = ( action, time = action.time, mode = 0 ) => {
    if(!action) return -1;

    const times = action._clip.tracks[0].times;
    //binary search
    let min = 0, max = times.length - 1;
    
    // edge cases
    if ( times[min] > time ) return mode == -1 ? -1 : 0;
    if ( times[max] < time ) return mode == 1 ? -1 : max;
    
    // time is between first and last frame
    let half = (min + max) >> 1;
    while ( min < half && half < max ){
        if ( time < times[half] ) max = half;
        else min = half;
        half = (min + max) >> 1;
    }

    if (mode == 0 ){
        return Math.abs( time - times[min] ) < Math.abs( time - times[max] ) ? min : max;
    }
    return mode == -1 ? (times[max] == time ? max : min) : (times[min] == time ? min : max);
}

const customArrow = ( fx, fy, fz, ix, iy, iz, thickness, color) => {
    const length = Math.sqrt( (ix-fx)**2 + (iy-fy)**2 + (iz-fz)**2 );
    if(length < 0.01) return null;

    const material = new THREE.MeshLambertMaterial( {color: color, transparent: true} );
    const head = new THREE.Mesh( SHARED_CONE_GEO, material );
    head.position.set( 0, 0, length );
    head.scale.set( 2*thickness, 2*thickness, 8*thickness );

    const arrow = new THREE.Group( );
    arrow.position.set( ix, iy, iz );
    arrow.lookAt( fx, fy, fz );
    arrow.add( head );

    return arrow;
}


// MagicLineGeometry: LineGeometry modified version with rgba colors (allow alpha vertex)
const fragmentShader =
	/* glsl */`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			float alpha = opacity;
			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			#include <logdepthbuf_fragment>
			#include <color_fragment>
            // diffuseColor.rgb = vColor.rgb;
            #ifdef USE_COLOR_ALPHA
                alpha = vColor.a;
                //diffuseColor.rgb = vColor.rbg;
            #endif

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			// #include <tonemapping_fragment>
			// #include <colorspace_fragment>
			// #include <fog_fragment>
			// #include <premultiplied_alpha_fragment>

		}
		`;

const vertexShader =
	/* glsl */`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

        #ifdef USE_COLOR_ALPHA

            attribute vec4 instanceColorStart;
            attribute vec4 instanceColorEnd;
        #else
            attribute vec3 instanceColorStart;
            attribute vec3 instanceColorEnd;
        #endif

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		void trimSegment( const in vec4 start, inout vec4 end ) {

			// trim end segment so it terminates between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
			float nearEstimate = - 0.5 * b / a;

			float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

			end.xyz = mix( start.xyz, end.xyz, alpha );

		}

		void main() {
            
            #ifdef USE_COLOR_ALPHA
                vColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;
            #endif

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart.xyz : instanceColorEnd.xyz;

			#endif

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
				vUv = uv;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					trimSegment( start, end );

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					trimSegment( end, start );

				}

			}

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`

class MagicLineGeometry extends LineGeometry {
    constructor( ) {
		super( );
	}

    /**
	 * Sets the given line colors for this geometry. The length must be a multiple of eight since
	 * each line segment is defined by a start end color in the pattern `(rgba rgba)`.
	 *
	 * @param {Float32Array|Array<number>} array - The position data to set.
	 * @return {LineSegmentsGeometry} A reference to this geometry.
	 */
	setColors( array ) {

        // converts [ r1, g1, b1, a1, r2, g2, b2, a2, ... ] to pairs format

		const length = array.length - 4;
		let colors = new Float32Array( 2 * length );

		for ( let i = 0; i < length; i += 4 ) {

			colors[ 2 * i ] = array[ i ];
			colors[ 2 * i + 1 ] = array[ i + 1 ];
			colors[ 2 * i + 2 ] = array[ i + 2 ];
			colors[ 2 * i + 3 ] = array[ i + 3 ];

			colors[ 2 * i + 4 ] = array[ i + 4 ];
			colors[ 2 * i + 5 ] = array[ i + 5 ];
			colors[ 2 * i + 6 ] = array[ i + 6 ];
			colors[ 2 * i + 7 ] = array[ i + 7 ];

		}
		

		if ( array instanceof Float32Array ) {

			colors = array;

		} else if ( Array.isArray( array ) ) {

			colors = new Float32Array( array );

		}

		const instanceColorBuffer = new THREE.InstancedInterleavedBuffer( colors, 8, 1 ); // rgba, rgba

		this.setAttribute( 'instanceColorStart', new THREE.InterleavedBufferAttribute( instanceColorBuffer, 4, 0 ) ); // rgba
		this.setAttribute( 'instanceColorEnd', new THREE.InterleavedBufferAttribute( instanceColorBuffer, 4, 4 ) ); // rgba

		return this;

	}
}

export { TrajectoriesHelper }