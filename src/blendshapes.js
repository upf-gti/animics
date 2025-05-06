import * as THREE from 'three'

class BlendshapesManager {

    constructor(skinnedMeshes = {}, morphTargetDictionary, mapNames ) {

        this.mapNames = mapNames;
        this.skinnedMeshes = skinnedMeshes;
        this.morphTargetDictionary = morphTargetDictionary;
        
    }
    
    // Create THREEJS morph target animation given mediapipe data
    createBlendShapesAnimation (data, applyRotation = false) {

        let clipData = {};
        let times = [];
        if(!data) {
            let names = {}
            for(let name in this.mapNames) {
                names[name] = 0;
            }
            names.dt = 0;
            data = [names];
        }
        for (let idx = 0; idx < data.length; idx++) {
            let dt = data[idx].dt * 0.001;
            let weights = data[idx];

            if(times.length)
                times.push(times[idx-1] + dt);
            else
                times.push(dt);
                
            for(let i in weights)
            {
                var value = weights[i];
                let map = this.mapNames[i];

                if(map == null) 
                {
                    if(!applyRotation) 
                        continue;

                    let axis = i.split("Yaw");
                    if(axis.length > 1)
                    {
                        switch(axis[0]){
                            case "LeftEye":
                                if(!clipData["mixamorig_LeftEye"])
                                {
                                    clipData["mixamorig_LeftEye"] = [];
                                    clipData["mixamorig_LeftEye"].length = data.length;
                                    clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                    clipData["mixamorig_LeftEye"][idx].y = value;
                            break;
                            case "RightEye":
                                if(!clipData["mixamorig_RightEye"])
                                {
                                    clipData["mixamorig_RightEye"] = [];
                                    clipData["mixamorig_RightEye"].length = data.length;
                                    clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_RightEye"][idx].y = value;
                            break;
                            case "Head":
                                if(!clipData["mixamorig_Head"])
                                {
                                    clipData["mixamorig_Head"] = [];
                                    clipData["mixamorig_Head"].length = data.length;
                                    clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_Head"][idx].y = value;
                            break;
                        }
                        continue;
                    }
                    axis = i.split("Pitch");
                    if(axis.length > 1)
                    {
                        switch(axis[0]){
                            case "LeftEye":
                                if(!clipData["mixamorig_LeftEye"])
                                {
                                    clipData["mixamorig_LeftEye"] = [];
                                    clipData["mixamorig_LeftEye"].length = data.length;
                                    clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_LeftEye"][idx].x = value;
                            break;
                            case "RightEye":
                                if(!clipData["mixamorig_RightEye"])
                                {
                                    clipData["mixamorig_RightEye"] = [];
                                    clipData["mixamorig_RightEye"].length = data.length;
                                    clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_RightEye"][idx].x = value;
                            break;
                            case "Head":
                                if(!clipData["mixamorig_Head"])
                                {
                                    clipData["mixamorig_Head"] = [];
                                    clipData["mixamorig_Head"].length = data.length;
                                    clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_Head"][idx].x = value;
                            break;
                        }
                        continue;
                    }
                    axis = i.split("Roll");
                    if(axis.length > 1)
                    {
                        switch(axis[0]){
                            case "LeftEye":
                                if(!clipData["mixamorig_LeftEye"])
                                {
                                    clipData["mixamorig_LeftEye"] = [];
                                    clipData["mixamorig_LeftEye"].length = data.length;
                                    clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_LeftEye"][idx].z = value;
                            break;

                            case "RightEye":
                                if(!clipData["mixamorig_RightEye"])
                                {
                                    clipData["mixamorig_RightEye"] = [];
                                    clipData["mixamorig_RightEye"].length = data.length;
                                    clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_RightEye"][idx].z = -value;
                            break;

                            case "Head":
                                if(!clipData["mixamorig_Head"])
                                {
                                    clipData["mixamorig_Head"] = [];
                                    clipData["mixamorig_Head"].length = data.length;
                                    clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

                                }
                                clipData["mixamorig_Head"][idx].z = value;
                            break;
                        }
                        continue;
                    }
                    else
                        continue;
                }
                else if (typeof(map) == 'string'){
                    if(!clipData[map])
                    {
                        clipData[map] = [];
                        clipData[map].length = data.length;
                        clipData[map].fill(0);
                    }
                    if(map.includes("Blink"))
                        value*=0.75;
                    clipData[map][idx] = Math.max(clipData[map][idx], value );
                }
                else if( typeof(map) == 'object'){
                    for(let j = 0; j < map.length; j++){
                        if(!clipData[map[j]])
                        {
                            clipData[map[j]] = [];
                            clipData[map[j]].length = data.length;
                            clipData[map[j]].fill(0);
                        }
                        if(map[j].includes("Blink"))
                            value*=0.75;
                        clipData[map[j]][idx] = Math.max(clipData[map[j]][idx], value );; 
                    }
                }
            }
        }

        let tracks = [];
        for(let bs in clipData)
        {

            if(typeof(clipData[bs][0]) == 'object' )
            {
                let animData = []; 
                clipData[bs].map((x) => {
                    let q = new THREE.Quaternion().setFromEuler(x);
                    animData.push(q.x);
                    animData.push(q.y);
                    animData.push(q.z);
                    animData.push(q.w);
                }, animData)
                tracks.push( new THREE.QuaternionKeyframeTrack(bs + '.quaternion', times, data ));
            }
            else
            {
                
                for(let mesh in this.skinnedMeshes)
                {
                    let mtIdx = this.morphTargetDictionary[mesh][bs]
                    if(mtIdx>-1)
                        tracks.push( new THREE.NumberKeyframeTrack(this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ bs + ']', times, clipData[bs]) );

                }
            }
        }    

        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;

        let bsAnimation = new THREE.AnimationClip( "bsAnimation", length, tracks);
        return bsAnimation;
    }

    // Convert THREEJS morph target animation into Mediapipe names format
    createMediapipeAnimation(animation) {
        const auTracks = [];
        const trackNames = [];

        // Extract time and values of each track
        for (let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            const targetName = track.name;
    
            // Check that it's a morph target
            if (targetName.includes('.morphTargetInfluences')) {
                const meshName = targetName.split('.morphTargetInfluences[')[0]; // Mesh name
                const morphTargetName = targetName.split('[')[1].split(']')[0]; // Morph target name
                if( meshName.includes( "Body" )) {
                    animation.tracks[i].name = animation.tracks[i].name.replace("Body.", "BodyMesh.");
                }
                else {
                    continue;
                }

                const times = track.times;
                const values = track.values;

                // Search the AU mapped to this morph target
                for ( let actionUnit in this.mapNames ) {
                    const mappedMorphs = this.mapNames[actionUnit];
                    
                    // If the morph target is mapped to the AU, assign the weight
                    if ( Array.isArray(mappedMorphs) ) {
                        if ( mappedMorphs.includes(morphTargetName) ) {
                            
                            const newName = this.getFormattedTrackName(actionUnit);
                            if(!newName || trackNames.indexOf( newName ) > -1) {
                                continue;
                            }
                            trackNames.push(newName);
                            auTracks.push( new THREE.NumberKeyframeTrack(newName, times, values ));
                            break;
                        }
                    } else if (mappedMorphs === morphTargetName) {

                        const newName = this.getFormattedTrackName(actionUnit);
                        if(!newName || trackNames.indexOf( newName ) > -1) {
                            continue;
                        }
                        trackNames.push(newName);
                        auTracks.push( new THREE.NumberKeyframeTrack(newName, times, values ));
                        break;
                    }
                }
            }
        }

        const length = -1;

        return new THREE.AnimationClip( animation.name ?? "auAnimation", length, auTracks);
    }

    // Format morph target track name into "FaceArea.MediapipeAcitionUnit"
    getFormattedTrackName(name) {

        let bs = "";
        for(let i = 0; i < BlendshapesManager.faceAreas.length; i++)
        {
            let toCompare = BlendshapesManager.faceAreas[i].toLowerCase().split(" ");
            let found = true;
            for(let j = 0; j < toCompare.length; j++) {

                if(!name.toLowerCase().includes(toCompare[j])) {
                    found = false;
                    break;
                }
            }
            if(found) {
                bs = BlendshapesManager.faceAreas[i] + "." + name;
            }

        }
        return bs;
    }

    getBlendshapesMap(name) {
        let map = this.mapNames[name];
        if(!map) return [];
        let bs = [];
        if(typeof map == 'string') {
            map = [map];
        }
    
        for(let mesh in this.skinnedMeshes) {

            for(let i = 0; i < map.length; i++) {
                bs.push(this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ map[i] + ']');
            }
        }
        return bs;
    }

    createEmptyAnimation(name) {
        const tracks = [];
        for(let mesh in this.morphTargetDictionary) {
            const morphTargets = this.morphTargetDictionary[mesh];
           for(let morphTarget in morphTargets) {            
                tracks.push( new THREE.NumberKeyframeTrack(mesh + '.morphTargetInfluences['+ morphTarget + ']', [0], [0] ));
           }
        }

        const length = -1;
        return new THREE.AnimationClip( name ?? "bsAnimation", length, tracks);
    }

    createEmptyAUAnimation(name) {
        let names = {}
        for(let name in this.mapNames) {
            names[name] = 0;
        }
        names.dt = 0;
        let data = [names];
        return this.createAnimationFromActionUnits(name, data);
    }

    createAnimationFromActionUnits(name, data) {

        let times = [];
        let auValues = {};
        
        if(!data) {
            let names = {}
            for(let name in this.mapNames) {
                names[name] = 0;
            }
            names.dt = 0;
            data = [names];
        }
    
        for (let idx = 0; idx < data.length; idx++) {
            
            let dt = data[idx].dt * 0.001;
            let weights = data[idx];
    
            if(times.length)
                times.push(times[idx-1] + dt);
            else
                times.push(dt);
                
            for(let i in weights)
            {
                var value = weights[i];
                if(!auValues[i])
                    auValues[i] = [value];
                else
                    auValues[i].push(value);
            }
        }
       
        let auTracks = [];
        for(let bs in auValues) {
            let bsname = this.getFormattedTrackName(bs);
            if ( bsname.length ){
                auTracks.push( new THREE.NumberKeyframeTrack(bsname, times, auValues[bs] ));
            }
        }
    
        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;
    
        let auAnimation = new THREE.AnimationClip( name ?? "auAnimation", length, auTracks);
        return auAnimation;
    }
}

BlendshapesManager.faceAreas =  [
    "Nose", 
    "Brow Right",
    "Brow Left",
    "Eye Right",
    "Eye Left",
    "Cheek Right",
    "Cheek Left",
    "Jaw",
    "Mouth"
]

export{ BlendshapesManager }