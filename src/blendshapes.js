import * as THREE from 'three'

class BlendshapesManager {

    constructor(skinnedMeshes = {}, morphTargetDictionary, mapNames ) {

        this.mapNames = mapNames;
        this.skinnedMeshes = skinnedMeshes;
        this.morphTargetDictionary = morphTargetDictionary;
        
    }
    
    createBlendShapesAnimation = function(data, applyRotation = false) {

        let clipData = {};
        let times = [];

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

    getBlendshapesMap = function(name) {
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

function createAnimationFromActionUnits(data) {

    let times = [];
    let auValues = {};

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
        let bsname = bs;
        for(let i = 0; i < BlendshapesManager.faceAreas.length; i++)
        {
            let toCompare = BlendshapesManager.faceAreas[i].toLowerCase().split(" ");
            let found = true;
            for(let j = 0; j < toCompare.length; j++) {

                if(!bs.toLowerCase().includes(toCompare[j])) {
                    found = false;
                    break;
                }
            }
            if(found)
                bsname = BlendshapesManager.faceAreas[i] + "." + bs;

        }
        auTracks.push( new THREE.NumberKeyframeTrack(bsname, times, auValues[bs] ));
    }

    // use -1 to automatically calculate
    // the length from the array of tracks
    const length = -1;

    let auAnimation = new THREE.AnimationClip("au-animation", length, auTracks);
    return auAnimation;
}

export{ BlendshapesManager, createAnimationFromActionUnits }