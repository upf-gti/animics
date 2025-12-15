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

    showLoginModal( onLoginCallback = null ) {
        let prompt = new LX.Dialog("Login", (p) => {
            
            const formData = { Username: "", Password: { value: "", type: "password" } };
            p.addForm("Login", formData, (value, event) => {
                this.remoteFileSystem.login(value.Username, value.Password, (session, response) => {
                    if(response.status == 1) {
                        if ( onLoginCallback ){
                            onLoginCallback(session, response);
                        }
                    }
                    else {
                        LX.popup(response.msg || "Can't connect to the server. Try again!", "Error");
                    }
                    prompt.close();
                    prompt = null;
                });
            }, {
                primaryActionName: "Login",
                secondaryActionName: "Sign Up",
                secondaryActionCallback: () =>{ 
                    this.showCreateAccountDialog({user: formData.Username.textComponent.value(), password: formData.Password.textComponent.value()}, onLoginCallback ); 
                    prompt.close();
                    prompt = null;
                }
            });

        }, {modal: true, closable: true} );
        return prompt;
    }
    
    showCreateAccountDialog(session = {user: "", password: ""}, onLoginCallback = null ) {
        let user = session.user, pass = session.password,
        pass2 = "", email = "";
    
        let prompt = new LX.Dialog("Create account", (p) => {
        
            const refresh = (p, msg) => {
                p.clear();
                if(msg) {
                    let w = p.addText(null, msg, null, {disabled: true, warning: true});
                }
                p.addText("Username", user, (v) => { user = v; });
                p.addText("Email", email, (v) => { email = v; }, {type: "email"});
                p.addText("Password", pass, (v) => { pass = v; }, {type: "password"});
                p.addText("Confirm password",pass2, (v) => { pass2 = v; }, {type: "password"});
                p.addButton(null, "Register",  () => {
                    if(pass === pass2)
                    {
                        this.remoteFileSystem.createAccount(user, pass, email, (request) => {
                            
                                if ( onLoginCallback ){
                                    onLoginCallback( this.remoteFileSystem.session, request );
                                }
                                prompt.close();
                                prompt = null;
                            }, (request)  => {
                                refresh(p, "Server status: " + (request.msg ||  "Can't connect to the server. Try again!"));
                            }
                        );
                    }
                    else
                    {
                        refresh(p, "Please confirm password");
                        console.error("Wrong pass confirmation");
                    }
                }, { buttonClass: "accent" })
            }
            refresh(p);
        }, {modal: true, closable: true});
    }

    _logout( callback = null ) {

        this.remoteFileSystem.logout(() => {
            this.remoteFileSystem.login("guest", "guest", () => {                    
                if ( callback ){
                    callback();
                }
            })
    
        }); 
    }

    async init(settings = {}) {
        this.mainArea = LX.mainArea || await LX.init();

        const mode = settings.mode;
        switch(mode) {
            case 'keyframe': case 'bvh': case 'bvhe': case 'video': case 'json':
                // Create empty animation
                this.editor = new KeyframeEditor(this);
            
                break;
            case 'bml': case 'sigml': case 'script':
                this.editor = new ScriptEditor(this);
            //     callback = this.onScriptProject.bind(this, settings.pendingResources );
                break;
            default:                  
                alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml'\n\tKeyframe animation: 'bvh', 'bvhe', 'json'");
                return false;  
        }
        let allowFolders = []
        if( this.editor.constructor == ScriptEditor ) {
            this.mode = Animics.Modes.SCRIPT;
            allowFolders = ["scripts"];
        }
        else {
            this.mode = Animics.Modes.KEYFRAME;
            this.videoProcessor = new VideoProcessor(this);
            allowFolders = ["clips"];
        }
        const session = this.remoteFileSystem.session;
        await this.remoteFileSystem.loadAllUnitsFolders(() => {
        }, allowFolders)
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

    /**
     * uploads file to the remote database
     * Displays a menu to rename the file in case of an existing file
     * @param {String} filename 
     * @param {String or Object} data file data
     * @param {String} type (folder) data type: "clips" (Keyframes Mode), "signs" (Script Mode), "presets" (Script Mode)
    * @param {Object} location file location {folderId, unitName, folderPath}
    * @param {String} callback (renamedFilename, files of user). If user did no rename, "renamedFilename" has the same value as "filename"
     */
        // await this.editor.remoteFileSystem.uploadFile( e.item.unit, e.item.asset_id, e.item.id, e.item.content);

    async uploadFile(filename, data, type, location, callback = () => {}) {
        const session = this.remoteFileSystem.getSession();
        const username = session.user.username;
        // const folder = "animics/"+ type;
        const fullpath = location.fullpath + "/" + filename;
        // const fullpath = location.unit + "/"+ location.fullpath + "/" + filename;
        // Check if the file already exists
        const exists = this.remoteFileSystem.checkFileExists(fullpath);

        if(exists) {

            let overwriteDialog = new LX.Dialog( `Failed to upload "${filename}"`, overwritePanel=>{
                const text = LX.makeContainer( 
                    ["100%", "auto"], "p-2 fg-primary", 
                    `Another file <em><strong>${filename}</strong></em> exists in the database`, 
                overwritePanel.root );

                overwritePanel.sameLine(2);
                overwritePanel.addButton("overwrite", "Overwrite", async () => {
                    const files = await this.remoteFileSystem.uploadFile(location.unit, location.asset_id, filename, new File([data], filename), []);
                    callback(filename, files);
                    overwriteDialog.close(); 
                }, {hideName: true, buttonClass: "error", width: "50%"} );
                overwritePanel.addButton("ok", "Rename", async () => {
                    let extensionIdx = filename.lastIndexOf(".");
                    if ( extensionIdx == -1 ){ 
                        extensionIdx = filename.length;
                    }
                    let nameWithoutExtension = filename.slice( 0, extensionIdx );
                    let extension = filename.slice( extensionIdx, filename.length );

                    let renameDialog = new LX.Dialog( `Rename file "${nameWithoutExtension}" before uploading`, p=>{
                        p.addText("Rename", nameWithoutExtension, (v)=>{
                            nameWithoutExtension = v;
                        }, {hideName: true, width: "100%", skipReset:true } );

                        p.sameLine(2);
                        p.addButton("cancel", "Omit", () => { renameDialog.close(); }, {hideName: true, buttonClass: "warning", width: "50%"} );
                        p.addButton("ok", "Rename", async () => {
                            if ( !nameWithoutExtension.length ){ return; }
                            this.uploadFile(nameWithoutExtension + extension, data, type, location, callback);
                            renameDialog.close(); 
                        }, {hideName: true, buttonClass: "accent", width: "50%"} );
                    }, { modal: true, size: ["33%", "fit-content"] });
                    // end of renameDialog
                    overwriteDialog.close(); 

                }, {hideName: true, buttonClass: "accent", width: "50%"} );
            }, { modal: true, size: ["33%", "fit-content"]});      
        }
        else {
            const files = await this.remoteFileSystem.uploadFile(location.unit, location.asset_id, filename, new File([data], filename), []);
            callback(filename, files);
        }
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
