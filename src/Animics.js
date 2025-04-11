import { KeyframeEditor, ScriptEditor } from "./Editor.js";
import { VideoProcessor } from "./VideoProcessor.js";
import { RemoteFileSystem } from "./FileSystem.js";
import { UTILS } from './Utils.js';

import { LX } from 'lexgui';

class Animics {
    static Modes = {KEYFRAME: 0, SCRIPT: 1};

    constructor() {
        this.remoteFileSystem = null;    
    }

    loadSession() {
        return new Promise( resolve => {
            this.remoteFileSystem = new RemoteFileSystem( async (session) => {
                if( !session ) {
                    console.log("Auto login of guest user")
        
                    this.remoteFileSystem.login("guest", "guest", (session) => {
                        
                        this.remoteFileSystem.loadUnits();
                        resolve();
                        return;
                    });
                }
                else if( this.editor ) {
                    this.editor.gui.changeLoginButton( session.user.username );
                }   
                resolve();
            }, (error) => {
                console.error("Server error. Can't connect to the FileSystem")
                resolve()
            });   
        })
    }

    init(settings = {}) {
        this.mainArea = LX.init();

        const mode = settings.mode;
        switch(mode) {
            case 'keyframe': case 'bvh': case 'bvhe': case 'video':
                // Create empty animaiton
                this.editor = new KeyframeEditor(this);
            
                break;
            case 'bml': case 'json': case 'sigml': case 'script':
                this.editor = new ScriptEditor(this);
            //     callback = this.onScriptProject.bind(this, settings.pendingResources );
                break;
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
        const session = this.remoteFileSystem.session;
        this.editor.init(settings, !session || session.user.username == "guest");
        
        window.addEventListener("resize", this.onResize.bind(this));
        return true;
    }

    onResize() {
        this.editor.resize();
    }

    showEditor() {
        
        this.editor.enable();
        this.videoProcessor.disable();
        
        UTILS.hideLoading();
    }
    
    /**
     * @description Processes an array of videos and generates the raw animations.
     * @param {Array of File or URL} videos
    */
    async processVideos( videos ) {

        this.editor.disable();
        const data = await this.videoProcessor.processVideos( videos );
        this.showEditor();
        return data;
    }

    /**
     * @description Creates and processes a webcam recorded video and generates a raw animation.
    */
    async processWebcam() {
        this.editor.disable();
        const data = await this.videoProcessor.processWebcam( );
        this.showEditor();
        return data;
    }

    updateData(filename, data, type, location, callback) {
        const extension = filename.split(".")[1];

        if(location == "server") {
            if(data.constructor.name == "Object") {
                data = JSON.stringify(data, null, 4);
            }
    
            this.uploadFile(filename, data, type, (v) => {
                let refreshType = "Signs";
                if(type == "presets") {
                    refreshType = "Presets";
                }
                else if (type == "clips") {
                    refreshType = ""
                }
                this["refresh" + refreshType + "Repository"] = true; 
                if(callback) 
                    callback(v);
            });   
            
        }
        else {
            const id = filename.replace("." + extension, "");
            this.localStorage[type].children.push({filename: id, id: id, folder: type, type: extension, data: data});
            
            if(callback)
                callback(filename);
        }
    }

    uploadFile(filename, data, type, callback = () => {}) {
        const session = this.remoteFileSystem.getSession();
        const username = session.user.username;
        const folder = "animics/"+ type;

        session.getFileInfo(username + "/" + folder + "/" + filename, (file) => {

            if(file && file.size) {
                // files = files.filter(e => e.unit === username && e.filename === filename);

                // if(files.length)
                // {
                    LX.prompt("Do you want to overwrite the file?", "File already exists", () => {
                        this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then( () => callback(filename));
                    }, {input: false, on_cancel: () => {
                        LX.prompt("Rename the file", "Save file", (v) => {
                            if(v === "" || !v) {
                                alert("You have to write a name.");
                                return;
                            }
                            this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + v, new File([data], filename ), []).then( () => callback(v));
                        }, {input: filename} )
                    }} )
                // }
                
            }
            else {
                this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then(() => callback(filename));
            }
        },
        () => {
            //create folder
        });
    }
    
    deleteData(fullpath, type, location, callback) {

        if(location == "server") {
    
            this.deleteFile(fullpath, (v) => {
                this["refresh" + (type == "signs" ? "Signs":"Presets") +"Repository"] = true; 
                if(callback) 
                    callback(v);
            });   
            
        }
        // else {
        //     const id = filename.replace("." + extension, "");
        //     this.localStorage[type].children.push({filename: id, id: id, folder: type, type: extension, data: data});
            
        //     if(callback)
        //         callback(true);
        // }
    }

    deleteFile(fullpath, callback = () => {}) {
        const session = this.remoteFileSystem.getSession();
        session.deleteFile( fullpath, (v) => {callback(v)}, (v) => {callback(v)} )
    }
}

export { Animics }
