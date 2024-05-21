import * as THREE from "three";
import * as MATH_UTILS from "./math.js";

var base_size = 1;

// Mediapipe landmark information (idx, name, parent landmark idx, x, y, z)
let LM_INFO = class LandmarksInfo {

    // The order is important! It's necessary later to keep track of previous quaternions
    static HIPS =                   new LandmarksInfo(33, "mixamorigHips",            -1 , ["RIGHT_UP_LEG", "LEFT_UP_LEG"]);

    static RIGHT_UP_LEG =           new LandmarksInfo(24, "mixamorigRightUpLeg",       33, ["RIGHT_LEG"]);
    static RIGHT_LEG =              new LandmarksInfo(26, "mixamorigRightLeg",         24, ["RIGHT_HEEL"]);
    static RIGHT_HEEL =             new LandmarksInfo(28, "mixamorigRightFoot",        26, ["RIGHT_FOOT_INDEX"]);
    static RIGHT_FOOT_INDEX =       new LandmarksInfo(32, "mixamorigRightToeBase",     28, ["RIGHT_FOOT_INDEX_END"]);
    static RIGHT_FOOT_INDEX_END =   new LandmarksInfo(74, "mixamorigRightToe_End",     32, []);

    static LEFT_UP_LEG =            new LandmarksInfo(23, "mixamorigLeftUpLeg",        33, ["LEFT_LEG"]);
    static LEFT_LEG =               new LandmarksInfo(25, "mixamorigLeftLeg",          23, ["LEFT_HEEL"]);
    static LEFT_HEEL =              new LandmarksInfo(27, "mixamorigLeftFoot",         25, ["LEFT_FOOT_INDEX"]);
    static LEFT_FOOT_INDEX =        new LandmarksInfo(31, "mixamorigLeftToeBase",      27, ["LEFT_FOOT_INDEX_END"]);
    static LEFT_FOOT_INDEX_END =    new LandmarksInfo(73, "mixamorigLeftToe_End",      31, []);

    static SPINE =                  new LandmarksInfo(35, "mixamorigSpine",            33, ["SPINE1"]);
    static SPINE1 =                 new LandmarksInfo(36, "mixamorigSpine1",           35, ["SPINE2"]);
    static SPINE2 =                 new LandmarksInfo(37, "mixamorigSpine2",           36, ["NECK"]);
    static NECK =                   new LandmarksInfo(38, "mixamorigNeck",             37, ["HEAD"]);
    static HEAD =                   new LandmarksInfo(0,  "mixamorigHead",             38, []);

    static RIGHT_SHOULDER =        new LandmarksInfo(73, "mixamorigRightShoulder",     37, ["RIGHT_ARM"]);
    static RIGHT_ARM =             new LandmarksInfo(12, "mixamorigRightArm",          73, ["RIGHT_FORE_ARM"]);
    static RIGHT_FORE_ARM =        new LandmarksInfo(14, "mixamorigRightForeArm",      12, ["RIGHT_HAND"]);
    static RIGHT_HAND =            new LandmarksInfo(16, "mixamorigRightHand",         14, []);
    
    static LEFT_SHOULDER =         new LandmarksInfo(74, "mixamorigLeftShoulder",      37, ["LEFT_ARM"]);
    static LEFT_ARM =              new LandmarksInfo(11, "mixamorigLeftArm",           74, ["LEFT_FORE_ARM"]);
    static LEFT_FORE_ARM =         new LandmarksInfo(13, "mixamorigLeftForeArm",       11, ["LEFT_HAND"]);
    static LEFT_HAND =             new LandmarksInfo(15, "mixamorigLeftHand",          13, []);
    
    static LEFT_INDEX1 =            new LandmarksInfo(39, "mixamorigLeftHandIndex1",   15, []);
    static LEFT_INDEX2 =            new LandmarksInfo(41, "mixamorigLeftHandIndex2",   39, []);
    static LEFT_INDEX3 =            new LandmarksInfo(43, "mixamorigLeftHandIndex3",   41, []);
    static LEFT_INDEX4 =            new LandmarksInfo(21, "mixamorigLeftHandIndex4",   43, []);

    static RIGHT_INDEX1 =           new LandmarksInfo(40, "mixamorigRightHandIndex1",  16, []);
    static RIGHT_INDEX2 =           new LandmarksInfo(42, "mixamorigRightHandIndex2",  40, []);
    static RIGHT_INDEX3 =           new LandmarksInfo(44, "mixamorigRightHandIndex3",  42, []);
    static RIGHT_INDEX4 =           new LandmarksInfo(22, "mixamorigRightHandIndex4",  44, []);

    static LEFT_THUMB1 =            new LandmarksInfo(45, "mixamorigLeftHandThumb1",   15, []);
    static LEFT_THUMB2 =            new LandmarksInfo(47, "mixamorigLeftHandThumb2",   45, []);
    static LEFT_THUMB3 =            new LandmarksInfo(49, "mixamorigLeftHandThumb3",   47, []);
    static LEFT_THUMB4 =            new LandmarksInfo(19, "mixamorigLeftHandThumb4",   49, []);

    static RIGHT_THUMB1 =           new LandmarksInfo(46, "mixamorigRightHandThumb1",  16, []);
    static RIGHT_THUMB2 =           new LandmarksInfo(48, "mixamorigRightHandThumb2",  46, []);
    static RIGHT_THUMB3 =           new LandmarksInfo(50, "mixamorigRightHandThumb3",  48, []);
    static RIGHT_THUMB4 =           new LandmarksInfo(20, "mixamorigRightHandThumb4",  50, []);

    static LEFT_MIDDLE1 =           new LandmarksInfo(51, "mixamorigLeftHandMiddle1",  15, []);
    static LEFT_MIDDLE2 =           new LandmarksInfo(53, "mixamorigLeftHandMiddle2",  51, []);
    static LEFT_MIDDLE3 =           new LandmarksInfo(55, "mixamorigLeftHandMiddle3",  53, []);
    static LEFT_MIDDLE4 =           new LandmarksInfo(57, "mixamorigLeftHandMiddle4",  55, []);

    static RIGHT_MIDDLE1 =          new LandmarksInfo(52, "mixamorigRightHandMiddle1", 16, []);
    static RIGHT_MIDDLE2 =          new LandmarksInfo(54, "mixamorigRightHandMiddle2", 52, []);
    static RIGHT_MIDDLE3 =          new LandmarksInfo(56, "mixamorigRightHandMiddle3", 54, []);
    static RIGHT_MIDDLE4 =          new LandmarksInfo(58, "mixamorigRightHandMiddle4", 56, []);

    static LEFT_RING1 =             new LandmarksInfo(59, "mixamorigLeftHandRing1",    15, []);
    static LEFT_RING2 =             new LandmarksInfo(61, "mixamorigLeftHandRing2",    59, []);
    static LEFT_RING3 =             new LandmarksInfo(63, "mixamorigLeftHandRing3",    61, []);
    static LEFT_RING4 =             new LandmarksInfo(65, "mixamorigLeftHandRing4",    63, []);

    static RIGHT_RING1 =            new LandmarksInfo(60, "mixamorigRightHandRing1",   16, []);
    static RIGHT_RING2 =            new LandmarksInfo(62, "mixamorigRightHandRing2",   60, []);
    static RIGHT_RING3 =            new LandmarksInfo(64, "mixamorigRightHandRing3",   62, []);
    static RIGHT_RING4 =            new LandmarksInfo(66, "mixamorigRightHandRing4",   64, []);

    static LEFT_PINKY1 =            new LandmarksInfo(67, "mixamorigLeftHandPinky1",   15, []);
    static LEFT_PINKY2 =            new LandmarksInfo(69, "mixamorigLeftHandPinky2",   67, []);
    static LEFT_PINKY3 =            new LandmarksInfo(71, "mixamorigLeftHandPinky3",   69, []);
    static LEFT_PINKY4 =            new LandmarksInfo(17, "mixamorigLeftHandPinky4",   71, []);

    static RIGHT_PINKY1 =           new LandmarksInfo(68, "mixamorigRightHandPinky1",  16, []);
    static RIGHT_PINKY2 =           new LandmarksInfo(70, "mixamorigRightHandPinky2",  68, []);
    static RIGHT_PINKY3 =           new LandmarksInfo(72, "mixamorigRightHandPinky3",  70, []);
    static RIGHT_PINKY4 =           new LandmarksInfo(16, "mixamorigRightHandPinky4",  72, []);

    static HEAD_TOP_END =           new LandmarksInfo(39, "mixamorigHeadTop_End",       0 , []);

    constructor(idx, name, parent_idx, children_names) {
        this.idx = idx;
        this.name = name;
        this.parent_idx = parent_idx;
        this.children_names = children_names;
    }
}

// Based on mixamo skeleton
function createThreeJsSkeleton() {

    const bones = [];

    // used to store bone by landmark index, necessary to create hierarchy
    const temp_map = {};

    var lmInfoArray = Object.keys(LM_INFO);

    for (const lm_data in lmInfoArray) {

        var lm_info = LM_INFO[lmInfoArray[lm_data]];

        var bone = new THREE.Bone();
        bone.name = lm_info.name;

        bone.position.x = lm_info.position.x;
        bone.position.y = lm_info.position.y;
        bone.position.z = lm_info.position.z;

        bone.quaternion.x = lm_info.rotation.x;
        bone.quaternion.y = lm_info.rotation.y;
        bone.quaternion.z = lm_info.rotation.z;
        bone.quaternion.w = lm_info.rotation.w;

        temp_map[lm_info.idx] = bone;

        if (lm_info.parent_idx != -1) {

            if (temp_map[lm_info.parent_idx] != undefined) {
                temp_map[lm_info.parent_idx].add(bone);
            }
        }

        bones.push( bone );
    }

    return new THREE.Skeleton( bones );
}
// Based on mixamo skeleton
function createThreeJSSkeleton(skeleton) {

    const bones = [];

    // used to store bone by landmark index, necessary to create hierarchy
    const temp_map = {};


    for (var i = 0; i<skeleton.length; i++) {

        var lm_info = skeleton[i];

        var bone = new THREE.Bone();
        bone.name = lm_info.name;
        bone.position.x = lm_info.pos[0];
        bone.position.y = lm_info.pos[1];
        bone.position.z = lm_info.pos[2];

        temp_map[lm_info.idx] = bone;

        if (lm_info.parent_idx != -1) {

            if (temp_map[lm_info.parent_idx] != undefined) {
                temp_map[lm_info.parent_idx].add(bone);
            }
        }

        bones.push( bone );
    }

    return new THREE.Skeleton( bones );
}

function getGlobalRotation(bone) {

    if (!bone.parent) return bone.quaternion;

    return getGlobalRotation(bone.parent).multiply(bone.quaternion);
}

function updateThreeJSSkeleton(skeleton) {


    var lmInfoArray = Object.keys(LM_INFO);

    for (const lm_data in lmInfoArray) {

        var lm_info = LM_INFO[lmInfoArray[lm_data]];

        for(var i = 0; i<skeleton.length;i++){
            var name = skeleton[i].name.replaceAll(/[-_.:]/g,"").toUpperCase();
            if(lm_info.name.replaceAll(/[-_.:]/g,"").toUpperCase() == name)
            {
                skeleton[i].updateMatrixWorld(true);
                LM_INFO[lmInfoArray[lm_data]].name = skeleton[i].name;
                LM_INFO[lmInfoArray[lm_data]].position = skeleton[i].position.clone();
                LM_INFO[lmInfoArray[lm_data]].rotation = skeleton[i].quaternion.clone();

                var global_rotation = new THREE.Quaternion();
                skeleton[i].getWorldQuaternion(global_rotation);
                LM_INFO[lmInfoArray[lm_data]].global_rotation = global_rotation;

                var global_position = new THREE.Vector3();
                skeleton[i].getWorldPosition(global_position);
                LM_INFO[lmInfoArray[lm_data]].global_position = global_position;
                /*temp_map[lm_info.idx] = bone;
                if (lm_info.parent_idx != -1) {
                    if (temp_map[lm_info.parent_idx] != undefined) {
                        temp_map[lm_info.parent_idx].add(bone);
                    }
                }
                bones.push( bone );*/
                continue;
            }
        }

    }
}

function midLandmark(landmark1, landmark2, factor) {
    return {
        'x' : (landmark1.x * (1.0 - factor) + landmark2.x * factor),
        'y' : (landmark1.y * (1.0 - factor) + landmark2.y * factor),
        'z' : (landmark1.z * (1.0 - factor) + landmark2.z * factor),
        'visibility' : (landmark1.visibility * (1.0 - factor) + landmark2.visibility * factor),
    }
}

// Inject new landmarks for spine
function injectNewLandmarks(landmarks) {

    for (let i = 0; i < landmarks.length; ++i) {

        // Insert hips - 33
        var pelvis_r = landmarks[i].PLM[23];
        var pelvis_l = landmarks[i].PLM[24];
        var hips = midLandmark(pelvis_r, pelvis_l, 0.5);
        //hips.z -= 0.18;

        landmarks[i].PLM.push(hips);

        // Insert mouth_middle - 34
        var mouth_r = landmarks[i].PLM[9];
        var mouth_l = landmarks[i].PLM[10];
        var mouth_mid = midLandmark(mouth_r, mouth_l, 0.5);
        landmarks[i].PLM.push(mouth_mid);

        // neck landmark
        var arm_r = landmarks[i].PLM[12];
        var arm_l = landmarks[i].PLM[11];
        var neck =  midLandmark(arm_r, arm_l, 0.5);
        //spine2.y +=0.18;

        // shoulders landmark - 73 74
        var shoulder_r =  midLandmark(arm_r, neck, 0.5);
        shoulder_r.z = arm_r.z;
        var shoulder_l =  midLandmark(arm_l, neck, 0.5);
        shoulder_l.z = arm_l.z;

        // Hips and neck landmarks
        var hips = landmarks[i].PLM[33];

        var spine1 = midLandmark(hips, neck, 0.5);

        // Insert spine - 35
        landmarks[i].PLM.push(midLandmark(hips, spine1, 0.5));

        // Insert spine1 - 36
        landmarks[i].PLM.push(spine1);

        // Insert spine2 - 37
        landmarks[i].PLM.push(midLandmark(spine1, neck, 3.0 / 4.0));

        // Insert neck - 38
        landmarks[i].PLM.push(neck);

        //Right hand
        if(landmarks[i].RLM){
            var thumb_r1 = landmarks[i].RLM[1];
            var thumb_r2 = landmarks[i].RLM[2];
            var thumb_r3 = landmarks[i].RLM[3];
            var thumb_r4 = landmarks[i].RLM[4];

            var index_r1 = landmarks[i].RLM[5];
            var index_r2 = landmarks[i].RLM[6];
            var index_r3 = landmarks[i].RLM[7];
            var index_r4 = landmarks[i].RLM[8];

            var middle_r1 = landmarks[i].RLM[9];
            var middle_r2 = landmarks[i].RLM[10];
            var middle_r3 = landmarks[i].RLM[11];
            var middle_r4 = landmarks[i].RLM[12];

            var ring_r1 = landmarks[i].RLM[13];
            var ring_r2 = landmarks[i].RLM[14];
            var ring_r3 = landmarks[i].RLM[15];
            var ring_r4 = landmarks[i].RLM[16];

            var pinky_r1 = landmarks[i].RLM[17];
            var pinky_r2 = landmarks[i].RLM[18];
            var pinky_r3 = landmarks[i].RLM[19];
            var pinky_r4 = landmarks[i].RLM[20];
        }
        else{
            var thumb_r4 = landmarks[i].PLM[22];
            var thumb_r2 = midLandmark(landmarks[i].PLM[14], thumb_r4, 0.5)
            var thumb_r1 = midLandmark(landmarks[i].PLM[14], thumb_r2, 0.5)
            var thumb_r3 = midLandmark(thumb_r4, thumb_r2, 0.5)

            var index_r4 = landmarks[i].PLM[20];
            var index_r2 = midLandmark(landmarks[i].PLM[14], index_r4, 0.5)
            var index_r1 = midLandmark(landmarks[i].PLM[14], index_r2, 0.5)
            var index_r3 = midLandmark(index_r4, index_r2, 0.5)

            var pinky_r4 = landmarks[i].PLM[18];
            var pinky_r2 = midLandmark(landmarks[i].PLM[14], pinky_r4, 0.5)
            var pinky_r1 = midLandmark(landmarks[i].PLM[14], pinky_r2, 0.5)
            var pinky_r3 = midLandmark(pinky_r4, pinky_r2, 0.5);

            var middle_r4 = midLandmark(index_r4, pinky_r4, 0.25);
            var middle_r1 = midLandmark(index_r1, pinky_r1, 0.25);
            var middle_r2 = midLandmark(middle_r1, middle_r4, 0.25);
            var middle_r3 = midLandmark(middle_r1, middle_r4, 0.75);

            var ring_r4 = midLandmark(index_r4, pinky_r4, 0.75);
            var ring_r1 = midLandmark(index_r1, pinky_r1, 0.75);
            var ring_r2 = midLandmark(ring_r1, ring_r4, 0.25);
            var ring_r3 = midLandmark(ring_r1, middle_r4, 0.75);

        }
        //Left hand
        if(landmarks[i].LLM){
            var thumb_l1 = landmarks[i].LLM[1];
            var thumb_l2 = landmarks[i].LLM[2];
            var thumb_l3 = landmarks[i].LLM[3];
            var thumb_l4 = landmarks[i].LLM[4];

            var index_l1 = landmarks[i].LLM[5];
            var index_l2 = landmarks[i].LLM[6];
            var index_l3 = landmarks[i].LLM[7];
            var index_l4 = landmarks[i].LLM[8];

            var middle_l1 = landmarks[i].LLM[9];
            var middle_l2 = landmarks[i].LLM[10];
            var middle_l3 = landmarks[i].LLM[11];
            var middle_l4 = landmarks[i].LLM[12];

            var ring_l1 = landmarks[i].LLM[13];
            var ring_l2 = landmarks[i].LLM[14];
            var ring_l3 = landmarks[i].LLM[15];
            var ring_l4 = landmarks[i].LLM[16];

            var pinky_l1 = landmarks[i].LLM[17];
            var pinky_l2 = landmarks[i].LLM[18];
            var pinky_l3 = landmarks[i].LLM[19];
            var pinky_l4 = landmarks[i].LLM[20];
        }
        else{
            var thumb_l4 = landmarks[i].PLM[21];
            var thumb_l2 = midLandmark(landmarks[i].PLM[15], thumb_l4, 0.5)
            var thumb_l1 = midLandmark(landmarks[i].PLM[15], thumb_l2, 0.5)
            var thumb_l3 = midLandmark(thumb_l4, thumb_l2, 0.5)

            var index_l4 = landmarks[i].PLM[19];
            var index_l2 = midLandmark(landmarks[i].PLM[15], index_l4, 0.5)
            var index_l1 = midLandmark(landmarks[i].PLM[15], index_l2, 0.5)
            var index_l3 = midLandmark(index_l4, index_l2, 0.5)

            var pinky_l4 = landmarks[i].PLM[17];
            var pinky_l2 = midLandmark(landmarks[i].PLM[15], pinky_l4, 0.5)
            var pinky_l1 = midLandmark(landmarks[i].PLM[15], pinky_l2, 0.5)
            var pinky_l3 = midLandmark(pinky_l4, pinky_l2, 0.5);

            var middle_l4 = midLandmark(index_l4, pinky_l4, 0.25);
            var middle_l1 = midLandmark(index_l1, pinky_l1, 0.25);
            var middle_l2 = midLandmark(middle_l1, middle_l4, 0.25);
            var middle_l3 = midLandmark(middle_l1, middle_l4, 0.75);

            var ring_l4 = midLandmark(index_l4, pinky_l4, 0.75);
            var ring_l1 = midLandmark(index_l1, pinky_l1, 0.75);
            var ring_l2 = midLandmark(ring_l1, ring_l4, 0.25);
            var ring_l3 = midLandmark(ring_l1, middle_l4, 0.75);
        }

        // Insert thumb right 1 - 39
        landmarks[i].PLM.push(thumb_r1);
        // Insert thumb left 1 - 40
        landmarks[i].PLM.push(thumb_l1);
        // Insert thumb right 2 - 41
        landmarks[i].PLM.push(thumb_r2);
        // Insert thumb left 2 - 42
        landmarks[i].PLM.push(thumb_l2);
        // Insert thumb right 3 - 43
        landmarks[i].PLM.push(thumb_r3);
        // Insert thumb left 3 - 44
        landmarks[i].PLM.push(thumb_l3);
        // Insert thumb right 4 - 21
        landmarks[i].PLM[21] = thumb_r4;
        // Insert thumb right 4 - 22
        landmarks[i].PLM[22] = thumb_l4;

        // Insert index right 1 - 45
        landmarks[i].PLM.push(index_r1);
        // Insert index left 1 - 46
        landmarks[i].PLM.push(index_l1);
        // Insert index right 2 - 47
        landmarks[i].PLM.push(index_r2);
        // Insert index left 2 - 48
        landmarks[i].PLM.push(index_l2);
        // Insert index right 3 - 49
        landmarks[i].PLM.push(index_r3);
        // Insert index left 3 - 50
        landmarks[i].PLM.push(index_l3);
        // Insert index right 4 - 19
        landmarks[i].PLM[19] = index_r4;
        // Insert index right 4 - 20
        landmarks[i].PLM[20] = index_l4;

        // Insert middle right 1 - 51
        landmarks[i].PLM.push(middle_r1);
        // Insert middle left 1 - 52
        landmarks[i].PLM.push(middle_l1);
        // Insert middle right 2 - 53
        landmarks[i].PLM.push(middle_r2);
        // Insert middle left 2 - 54
        landmarks[i].PLM.push(middle_l2);
        // Insert middle right 3 - 55
        landmarks[i].PLM.push(middle_r3);
        // Insert middle left 3 - 56
        landmarks[i].PLM.push(middle_l3);
        // Insert middle right 4 - 57
        landmarks[i].PLM.push(middle_r4);
        // Insert middle right 4 - 58
        landmarks[i].PLM.push(middle_l4);

        // Insert ring right 1 - 59
        landmarks[i].PLM.push(ring_r1);
        // Insert ring left 1 - 60
        landmarks[i].PLM.push(ring_l1);
        // Insert ring right 2 - 61
        landmarks[i].PLM.push(ring_r2);
        // Insert ring left 2 - 62
        landmarks[i].PLM.push(ring_l2);
        // Insert ring right 3 - 63
        landmarks[i].PLM.push(ring_r3);
        // Insert ring left 3 - 64
        landmarks[i].PLM.push(ring_l3);
        // Insert ring right 4 - 65
        landmarks[i].PLM.push(ring_r4);
        // Insert ring right 4 - 66
        landmarks[i].PLM.push(ring_l4);

        // Insert pinky right 1 - 67
        landmarks[i].PLM.push(pinky_r1);
        // Insert pinky left 1 - 68
        landmarks[i].PLM.push(pinky_l1);
        // Insert pinky right 2 - 69
        landmarks[i].PLM.push(pinky_r2);
        // Insert pinky left 2 - 70
        landmarks[i].PLM.push(pinky_l2);
        // Insert pinky right 3 - 71
        landmarks[i].PLM.push(pinky_r3);
        // Insert pinky left 3 - 72
        landmarks[i].PLM.push(pinky_l3);
        // Insert pinky right 4 - 17
        landmarks[i].PLM[17] = pinky_r4;
        // Insert pinky right 4 - 18
        landmarks[i].PLM[18] = pinky_l4;


        // Insert right shoulder - 73
        landmarks[i].PLM.push(shoulder_r);
        // Insert left shoulder - 74
        landmarks[i].PLM.push(shoulder_l);

        // Insert right toe end - 75
        var toebase_r = Object.assign({}, landmarks[i].PLM[32]);
        toebase_r.z-=0.5;
        //toebase_r.y-=1;
        landmarks[i].PLM.push(toebase_r);
        // Insert left toe end - 76
        var toebase_l = Object.assign({},landmarks[i].PLM[31]);
        toebase_l.z-=0.5;

        landmarks[i].PLM.push(toebase_l);
    }
}

function createSkeleton() {

    return createThreeJsSkeleton();
}

function createAnimation(name, landmarks) {

    const tracks = [];

    var lmInfoArray = Object.keys(LM_INFO);

    const previous_quats = [];

    for (const lm_data in lmInfoArray) {

        const pos_values = [];
        const quatValues = [];

        const times = [];
        var timeAccum = 0.0;

        var lm_info = LM_INFO[lmInfoArray[lm_data]];

        // Initialize first rotation
        previous_quats[lm_info.idx] = [];

        var debug_printed = false;


        for (let i = 0; i < landmarks.length; ++i) {

            if (lm_info.children_names.length == 0) continue;            
            
            if (lm_info.parent_idx == -1 || lm_info.children_names.length > 1) {
                pos_values.push(landmarks[i].PLM[lm_info.idx].x);
                pos_values.push(landmarks[i].PLM[lm_info.idx].y);
                pos_values.push(-landmarks[i].PLM[lm_info.idx].z);

                var quat = new THREE.Quaternion();
                //quat.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI / 2.0)

                previous_quats[lm_info.idx].push(quat);

                quatValues.push(quat.x);
                quatValues.push(quat.y);
                quatValues.push(quat.z);
                quatValues.push(quat.w);
                /*let obj = new THREE.Object3D();
                obj.position = new THREE.Vector3(landmarks[i].PLM[lm_info.idx].x, landmarks[i].PLM[lm_info.idx].y, landmarks[i].PLM[lm_info.idx].z);
                pos_values.push(landmarks[i].PLM[lm_info.idx].x);
                pos_values.push(landmarks[i].PLM[lm_info.idx].y);
                pos_values.push(landmarks[i].PLM[lm_info.idx].z);
                var quat = obj.quaternion;
                previous_quats[lm_info.idx].push(quat);
                quatValues.push(quat.x);
                quatValues.push(quat.y);
                quatValues.push(quat.z);
                quatValues.push(quat.w);*/

            } else {

                // pos_values.push(lm_info.x);
                // pos_values.push(lm_info.y);
                // pos_values.push(lm_info.z);

                //if (lm_info.name == "mixamorigRightUpLeg" || lm_info.name == "mixamorigRightLeg") {

                    var child_lm_info = LM_INFO[lm_info.children_names[0]];

                    var original_joint_dir = new THREE.Vector3().subVectors(child_lm_info.global_position, lm_info.global_position);
                    landmarks[i].PLM[child_lm_info.idx].z *=-1;
                   // landmarks[i].PLM[lm_info.idx].z *=-1;
                    var landmarks_dir = new THREE.Vector3().subVectors(landmarks[i].PLM[child_lm_info.idx], landmarks[i].PLM[lm_info.idx]);

                    //var quat_info = MATH_UTILS.calc_rotation_v1( landmarks[i].PLM[lm_info.idx], landmarks[i].PLM[child_lm_info.idx], previous_quats[lm_info.parent_idx][i])
                    var quat_info = MATH_UTILS.calc_rotation(original_joint_dir, landmarks_dir, previous_quats[lm_info.parent_idx][i])

                    if (!debug_printed) {
                        var ogd_norm = original_joint_dir.clone().normalize();
                        var lnd_norm = landmarks_dir.clone().normalize();
                    
                        // console.log("--------------------- " + lm_info.name + "------------------------")
                        // console.log("original dir: " + ogd_norm.x + ", " + ogd_norm.y + ", " + ogd_norm.z);
                        // console.log("landmark dir: " + lnd_norm.x + ", " + lnd_norm.y + ", " + lnd_norm.z);
                        // console.log("---------------------------------------------")
                        debug_printed = true;
                    }

                    previous_quats[lm_info.idx].push(quat_info.rotation);

                    quatValues.push(quat_info.rotation_diff.x);
                    quatValues.push(quat_info.rotation_diff.y);
                    quatValues.push(quat_info.rotation_diff.z);
                    quatValues.push(quat_info.rotation_diff.w);
                //}
            }

            timeAccum += landmarks[i].dt / 1000.0;
            times.push(timeAccum);
        }

        if (times.length > 0) {

            if (pos_values.length > 0) {
                const positions = new THREE.VectorKeyframeTrack( lm_info.name + '.position', times, pos_values);
                tracks.push(positions);
            }

            if (quatValues.length > 0) {
                const rotations = new THREE.QuaternionKeyframeTrack( lm_info.name + '.quaternion', times, quatValues);
                tracks.push(rotations);
            }
        }
    }

    // use -1 to automatically calculate
    // the length from the array of tracks
    const length = -1;

    return new THREE.AnimationClip(name || "sign_anim", length, tracks);
}

function createAnimationFromRotations(name, nn) {

    var quatData = nn.getQuaternions(); // ML regression of the quaternions
    
    // clean data
    var names = quatData[quatData.length - 1];
    if(typeof(names[0]) != "string")
        names = ["mixamorigHips.quaternion","mixamorigSpine.quaternion","mixamorigSpine1.quaternion","mixamorigSpine2.quaternion",
            "mixamorigNeck.quaternion","mixamorigHead.quaternion",
            "mixamorigLeftShoulder.quaternion","mixamorigLeftArm.quaternion","mixamorigLeftForeArm.quaternion","mixamorigLeftHand.quaternion",
                "mixamorigLeftHandThumb1.quaternion","mixamorigLeftHandThumb2.quaternion","mixamorigLeftHandThumb3.quaternion",
                "mixamorigLeftHandIndex1.quaternion","mixamorigLeftHandIndex2.quaternion","mixamorigLeftHandIndex3.quaternion",
                "mixamorigLeftHandMiddle1.quaternion","mixamorigLeftHandMiddle2.quaternion","mixamorigLeftHandMiddle3.quaternion",
                "mixamorigLeftHandRing1.quaternion","mixamorigLeftHandRing2.quaternion","mixamorigLeftHandRing3.quaternion",
                "mixamorigLeftHandPinky1.quaternion","mixamorigLeftHandPinky2.quaternion","mixamorigLeftHandPinky3.quaternion",
            "mixamorigRightShoulder.quaternion","mixamorigRightArm.quaternion","mixamorigRightForeArm.quaternion","mixamorigRightHand.quaternion",
                "mixamorigRightHandThumb1.quaternion","mixamorigRightHandThumb2.quaternion","mixamorigRightHandThumb3.quaternion",
                "mixamorigRightHandIndex1.quaternion","mixamorigRightHandIndex2.quaternion","mixamorigRightHandIndex3.quaternion",
                "mixamorigRightHandMiddle1.quaternion","mixamorigRightHandMiddle2.quaternion","mixamorigRightHandMiddle3.quaternion",
                "mixamorigRightHandRing1.quaternion","mixamorigRightHandRing2.quaternion","mixamorigRightHandRing3.quaternion",
                "mixamorigRightHandPinky1.quaternion","mixamorigRightHandPinky2.quaternion","mixamorigRightHandPinky3.quaternion",
            "mixamorigLeftUpLeg.quaternion","mixamorigLeftLeg.quaternion","mixamorigLeftFoot.quaternion",
            "mixamorigRightUpLeg.quaternion","mixamorigRightLeg.quaternion","mixamorigRightFoot.quaternion"];
    // Not Used: "mixamorigLeftUpLeg.quaternion","mixamorigLeftLeg.quaternion","mixamorigLeftFoot.quaternion","mixamorigLeftToeBase.quaternion","mixamorigRightUpLeg.quaternion","mixamorigRightLeg.quaternion","mixamorigRightFoot.quaternion","mixamorigRightToeBase.quaternion"
    //names = retargetNames(names);
    const numBones = quatData[0].length;

    let tracks = [];
    let quatValues = [];
    let times = [];
    let timeAccum = 0.0;

    let quatIdx = 0;
    let amount = 4;

    tracks.push(new THREE.VectorKeyframeTrack("mixamorigHips.position", [0], []));
   
    while(quatIdx < numBones) {
        
        quatValues = [];
        times = [];
        timeAccum = 0.0;

        // loop for all frames
        for (let frameIdx = 0; frameIdx < quatData.length; ++frameIdx) {
            quatValues.push(quatData[frameIdx][quatIdx + 0]);
            quatValues.push(quatData[frameIdx][quatIdx + 1]);
            quatValues.push(quatData[frameIdx][quatIdx + 2]);
            quatValues.push(quatData[frameIdx][quatIdx + 3]);

            timeAccum += nn.getFrameDelta( frameIdx );
            times.push(timeAccum);
        }
        
        const nameBone = names[Math.ceil(quatIdx/amount)];
        let data = new THREE.QuaternionKeyframeTrack( names[Math.ceil(quatIdx / amount)], times, quatValues);
        amount = 4;
        quatIdx += amount;

        if (!nameBone.includes("mixamorigHips.quaternion")) tracks.push(data); // set the hip static
    }

    // use -1 to automatically calculate
    // the length from the array of tracks
    const length = -1;

    return new THREE.AnimationClip(name || "sign_anim", length, tracks);
}

function postProcessAnimation(clip, landmarks) {

    let distance = 0;
    let rightHand = 0;
    let leftHand = 0;
    for(let i = 0; i < landmarks.length; i++){
        distance += landmarks[i].distanceToCamera;
        rightHand += landmarks[i].rightHandVisibility;
        leftHand += landmarks[i].leftHandVisibility;
    }
    distance /= landmarks.length;
    rightHand /= landmarks.length;
    leftHand /= landmarks.length;

    let tracks = [];
    for(let i = 0; i < clip.tracks.length; i++){
        let track = clip.tracks[i];
        if((track.name.includes("Hips") || track.name.includes("Spine") || track.name.includes("Neck")) && distance < 0.5)
        {
            continue;
        }
        tracks.push(track);
    }

    clip.tracks = tracks;
}

function retargetNames(names) {
    
    var lmInfoArray = Object.keys(LM_INFO);

    for(var i = 0; i < names.length; i++){
        for (const lm_data in lmInfoArray) {
            var lm_info = LM_INFO[lmInfoArray[lm_data]];
            var n = names[i].split(".");
            var root = n[0].replaceAll(/[-_.:]/g,"").toUpperCase();
            if(lm_info.name.replaceAll(/[-_.:]/g,"").toUpperCase() == root)
            {
                names[i] = lm_info.name+"."+n[1];
                continue;
            }   
        }
    }
    return names;
}

export { createSkeleton, createAnimation, createAnimationFromRotations, createThreeJSSkeleton, updateThreeJSSkeleton, injectNewLandmarks, postProcessAnimation };