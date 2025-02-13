import { KeyframeEditor, ScriptEditor } from "./Editor.js";
import { VideoProcessor } from "./VideoProcessor.js";
import { LX } from 'lexgui';

class Animics {
    static Modes = {KEYFRAME: 0, SCRIPT: 1};

    constructor() {
        this.mainArea = LX.init();
    }

    init(settings = {}) {
        
        const mode = settings.mode;
        switch(mode) {
            case "keyframe":
                // Create empty animaiton
                this.editor = new KeyframeEditor(this);
                break;
            // case 'capture':
            //     this.editor = new KeyframeEditor(this);
            //     callback = this.onBeginCapture.bind(this);
            //     break;
            // case 'video':
            //     this.editor = new KeyframeEditor(this);
            //     callback = this.onLoadVideos.bind(this, settings.pendingResources );
            //     break;
            // case 'bvh': case 'bvhe':
            //     this.editor = new KeyframeEditor(this);
            //     callback = this.onLoadAnimations.bind(this, settings.pendingResources );
            //     break;
            // case 'bml': case 'json': case 'sigml': case 'script':
            //     this.editor = new ScriptEditor(this);
            //     callback = this.onScriptProject.bind(this, settings.pendingResources );
            //     break;
            default:                  
                alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml', 'json'\n\tKeyframe animation: 'bvh', 'bvhe'");
                return false;  
        }
        
        if( this.editor.constructor == ScriptEditor ) {
            this.mode = Animics.Modes.SCRIPT;
        }
        else {
            this.mode = Animics.Modes.KEYFRAME;
            this.videoProcessor = new VideoProcessor(this);
        }
        
        this.editor.init();
        
        window.addEventListener("resize", this.onResize.bind(this));
        return true;
    }

    onResize() {
        this.editor.resize();
    }
}

export { Animics }
