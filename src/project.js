import { Vector3 } from "./libs/three.module.js";

function Project() {
    this.captured_data = [];
    this.bvh_name = "";
    this.bones = []; // list of joints with a hierarchy value
    this.path = undefined;
    this.mixer = undefined; // ?
    this.duration = 0; // seconds
    this.max_keyframes = 0;
    this.framerate = 0;

    this.landmarks = [];

    // data to speed the render
    this.pos = [];
    this.names = [];
    this.times = [];
}

Project.prototype.prepare_data = function (mixer, clip, skeleton) {
    this.mixer = mixer;
    this.duration = clip.duration;
    this.listNames(mixer._root.bones, 0, []);

    //get the root 3D positions
    var main3Dpos = clip.tracks[0].values;
    var offset_array = skeleton.bones.map(v => v.position);
    for (var i = 1; i < this.bones.length; i++) {
        var aux_list = [];
        for (var j = 3; j < main3Dpos.length - 3; j = j + 3)
            aux_list.push([main3Dpos[j] + offset_array[i].x, main3Dpos[j + 1] + offset_array[i].y, main3Dpos[j + 2] + offset_array[i].z]);
        this.pos.push(aux_list);
    }

    //ONWORK
    var example = clip.tracks[4].values; //positions of chest
    var aaa = [];
    for (var i = 0, j = 0; i < example.length-3; i=i+3, j=j+4)
    {
        var x = example[i];
        var y = example[i+1];
        var z = example[i+2];
        var vec = new Vector3(x, y, z);
        //aaa.push(vec.applyQuaternion());
    }

    //compute framerate
    var frames_list = clip.tracks.map(v => v.times.length);
    var max_keyframes = Math.max.apply(Math, frames_list);
    this.framerate = Math.floor(max_keyframes / this.duration);
    this.names = this.bones.map(v => [v.name, v.depth, v.selected, v.childs]);
    this.times = clip.tracks.map(v => v.times);
}

Project.prototype.listNames = function (bones, _depth, list) {
    for (var index in bones) {
        var result = { name: "", depth: null, childs: false, selected: false };
        var read = bones[index];
        result.name = read.name;
        result.depth = _depth;
        list.push(result);
        if (read.children.length > 0) {
            result.childs = true;
            this.listNames(read.children, _depth + 1, list);
        }
        if (_depth == 0)
        {
            this.bones = list;
            return;
        }
    }
    this.bones = list;
    return;
};

export { Project }