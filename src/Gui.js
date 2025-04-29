import { UTILS } from "./Utils.js";
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';
import { LX } from 'lexgui';
import 'lexgui/components/codeeditor.js';
import 'lexgui/components/timeline.js';
import { Gizmo } from "./Gizmo.js";

class Gui {

    constructor( editor)  {
       
        this.editor = editor;

        this.timelineVisible = false;
        this.currentTime = 0;
        this.duration = 0;

        // Create menu bar
        this.createMenubar(editor.editorArea);

        [this.menubarArea, this.mainArea] = editor.editorArea.sections;
        // split main area
        this.mainArea.split({sizes:["80%","20%"], minimizable: true});

        //left -> canvas, right -> side panel
        var [left, right] = this.mainArea.sections;
        left.id = "canvasarea";
        left.root.style.position = "relative";
        right.id = "sidepanel";
        this.mainArea.splitBar.style.zIndex = right.root.style.zIndex = 1;
        [this.canvasArea, this.timelineArea] = left.split({sizes: ["80%", "20%"], minimizable: true, type: "vertical"});

        this.sidePanel = right;
   
        //Create timelines (keyframes and clips)
        this.createTimelines( );

    }

    init( showGuide ) {       

        this.createSidePanel();
    
        this.showTimeline();
        
        // Canvas UI buttons
        this.createSceneUI(this.canvasArea);

        window.addEventListener("keydown", (event) => {
            if( event.key == "Escape" ) {
                this.closeDialogs(); 
            }
        })
        
        if(showGuide) {
            this.showGuide();
        }
    }

    showGuide() {
        
    }

    onCreateMenuBar( menubar ) {

    }

    setColorTheme(scheme = "light"){
        LX.setTheme(scheme);

        // Images are for dark mode. Applying a filter to adjust to light mode
        const faceAreas = document.getElementById("faceAreasContainer");
        if ( faceAreas ){
            faceAreas.style.filter = scheme == "dark" ? "" : "invert(1) saturate(1) hue-rotate(180deg)";
        }

        this.editor.scene.background.set(this.editor.theme[scheme].background);
        this.editor.scene.getObjectByName("Grid").material.color.set(this.editor.theme[scheme].grid);
        // this.editor.scene.getObjectByName("Grid").material.opacity.set(this.editor.theme[scheme].girdOpacity);
    }

    /** Create menu bar */
    createMenubar(area) {

        const menuEntries = [
            {
                name: "Project",
                submenu: [
                    {
                        name: "New animation",
                        icon: "Plus",
                        callback: () => {
                            this.editor.loadAnimation("animation" + Math.floor( performance.now()*1000 ).toString(), {});
                            this.updateAnimationPanel();
                        }
                    },
                    {
                        name: "Import animations",
                        icon: "FileInput",
                        submenu: [
                            { 
                                name: "From disk", icon: "FileInput", callback: () => this.importFiles(),
                                kbd: "CTRL+O"
                            },
                            {
                                name: "From database",
                                icon: "Database",
                                callback: () => this.createServerClipsDialog(),
                                kbd: "CTRL+I"
                            }
                        ]
                    },
                    {
                        name: "Timeline",
                        submenu: [
                            {
                                name: "Shortcuts",
                                icon: "Keyboard",
                                submenu: [
                                    {
                                        name: "Play-Pause", kbd: "SPACE"
                                    },
                                    {
                                        name:"Zoom", kbd: "Hold LSHIFT+Wheel"
                                    },
                                    {
                                        name: "Scroll", kbd: "Wheel"
                                    },
                                    {
                                        name: "Move timeline", kbd: "Left Click+Drag"
                                    }
                                ]
                            },
                            {
                                name: "Clear tracks", callback: () => this.editor.clearAllTracks()
                            }
                        ]
                    }
                ]
            },
            {
                name: "View",
                submenu: [
                    { name: "Theme", submenu: [
                        { name: "Light", icon: "Sun", callback: () => this.setColorTheme("light") },
                        { name: "Dark", icon: "Moon", callback: () => this.setColorTheme("dark") }
                    ] }
                ]
            }
        ]

        if(this.showVideo) {
            menuEntries[ 1 ].submenu.push({ name: "Show video", type: "checkbox", checked: this.showVideo, callback: (v) => {
                this.editor.setVideoVisibility( v );
                this.showVideo = v;
            }});
        }

        this.menubar = area.addMenubar(menuEntries);
        const menubar = this.menubar;     
        
        LX.addSignal( "@on_new_color_scheme", (el, value) => {
            //TO DO delete the current line and uncomment the getButton once lexgui is updated
            // this.menubar.getButton("Animics"); 
            this.menubar.root.children[0].children[0].children[0].src = value == "light" ? "data/imgs/animics_logo_lightMode.png" : "data/imgs/animics_logo.png";
        } )
        
        const colorScheme = document.documentElement.getAttribute( "data-theme" );
        menubar.setButtonImage("Animics", colorScheme == "light" ? "data/imgs/animics_logo_lightMode.png" : "data/imgs/animics_logo.png", () => window.open(window.location.origin).focus(), {float: "left"});

        // TODO
        // this.onCreateMenuBar(menubar);
        
        menubar.addButtons( [
            {
                title: "Play",
                icon: "Play@solid",
                swap: "Pause@solid",
                callback:  (event, swapValue) => { 
                    if(this.editor.state ) {
                        this.editor.pause();    
                    }
                    else {
                        this.editor.play();
                    }
                    if ( this.editor.activeTimeline ) {
                        this.editor.activeTimeline.setState( this.editor.state );
                    };
                }
            },
            {
                title: "Stop",
                icon: "Stop@solid",
                callback:  (event) => { 

                    this.editor.stop();
                    this.menubar.getButton("Play").setState(false); 
                    if ( this.editor.activeTimeline ) {
                        this.editor.activeTimeline.setState(false);
                    };

                }
            },
            {
                title: 'Animation loop',
                selectable: true,
                selected: this.editor.animLoop,
                icon: 'RefreshCw',
                callback: (event) =>  {
                    this.updateLoopModeGui( !this.editor.animLoop );
                }
            }
        ]);
        
        const user = this.editor.remoteFileSystem.session ? this.editor.remoteFileSystem.session.user : "" ;
        const loginName = (!user || user.username == "guest") ? "Login" : user.username;

        const loginButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-1 ml-auto fg-primary hover:bg-mix self-center content-center text-center cursor-pointer select-none", loginName, menubar.root );
        loginButton.tabIndex = "1";
        loginButton.id = "login";
        loginButton.role = "button";
        loginButton.listen( "click", () => {
            const session = this.editor.remoteFileSystem.session;
            const username = session ? session.user.username : "guest";
            if( this.prompt && this.prompt.root.checkVisibility() ) {
                return;
            }
            if( username != "guest" ) {
                this.showLogoutModal();
            }
            else {
                this.showLoginModal();
            }       
        } );

        menubar.setButtonIcon("Github", "Github@solid", () => { window.open("https://github.com/upf-gti/animics") }, {float:"right"});
    }

    importFiles() {
        
        const input = document.createElement('input');
        input.type = 'file';
        input.click();

        input.onchange = (e) => {
            this.editor.loadFiles(e.currentTarget.files);
        }
    }

    changeLoginButton( username = "Login" ) {
        const el = document.getElementById("login");
        el.innerText = username;
    }

    showLoginModal() {
        this.prompt = new LX.Dialog("Login", (p) => {
            let username = "";
            let password = "";
            const refresh = (p, msg) => {
                p.clear();
                if(msg) {
                    p.addText(null, msg, null, {disabled: true, warning: true,  className: "nobg"});
                }
                p.addText("User", username, (v) => {
                    username = v;
                });
                p.addText("Password", password, (v) => {
                    password = v;
                }, {type: "password"});
                p.sameLine(2);

                let b = p.addButton(null, "Cancel", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                });
                b.root.style.width = "50%";
    
                b = p.addButton(null, "Login", (v) => {
                    this.editor.remoteFileSystem.login(username, password, (session, response) => {
                        if(response.status == 1) {
                            this.changeLoginButton(session.user.username);
                            const folders = this.constructor == KeyframesGui ? ["clips"] : ["signs", "presets"] ;
                            this.editor.remoteFileSystem.loadAllUnitsFolders(null, folders);
                            this.prompt.close();
                            this.prompt = null;
                        }
                        else {                           
                            refresh(p, response.msg || "Can't connect to the server. Try again!");
                        }
                    });
                }, { buttonClass: "accent" });
                b.root.style.width = "50%";

                p.addButton(null, "Sign up", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                    this.showCreateAccountDialog({username, password});
                })
            }
            refresh(p);
            
        }, {modal: true, closable: true} )

        this.prompt.onclose = () => {
            // this.editor.getDictionaries();
            this.prompt = null;
        }
  
    }

    showLogoutModal() {
        this.prompt = LX.prompt( "Are you sure you want to logout?", "Logout", (v) => {
            this.editor.remoteFileSystem.logout(() => {
                this.editor.remoteFileSystem.login("guest", "guest", () => {
                    const folders = this.constructor == KeyframesGui ? ["clips"] : ["signs", "presets"];
                    this.editor.remoteFileSystem.loadAllUnitsFolders(null, folders);
                })
                this.changeLoginButton();

            }); 
            this.prompt = null;
        } , {input: false, accept: "Logout", modal: true})
        
        this.prompt.onclose = () => {
            this.prompt = null;
        }
    }

    showCreateAccountDialog(session = {user: "", password: ""})
    {
        let user = session.user, pass = session.password,
        pass2 = "", email = "";
        let errors = false;

        this.prompt = new LX.Dialog("Create account", (p) => {
        
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
                        this.editor.remoteFileSystem.createAccount(user, pass, email, (request) => {
                            
                                this.prompt.close();
                                this.prompt = null;
                                let el = document.querySelector("#Login");
                                el.innerText = session.user;
                                // this.showLoginModal( { user: user, password: pass});
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

    showExportAnimationsDialog(title, callback, options = { formats: [], folders: [], from: [] }) {
        options.modal = true;

        let value = "";
        let format = null;
        let folder = null;
        let from = null;
        const dialog = this.prompt = new LX.Dialog(title || "Export all animations", p => {
            const animations = this.editor.loadedAnimations;
            for( let animationName in animations ) { // animationName is of the source anim (not the bind)
                let animation = animations[animationName]; 
                p.sameLine();
                p.addCheckbox(animationName, animation.export, (v) => animation.export = v, {hideName: true, label: ""});
                p.addLabel(animationName, {width:"30%"});
                p.addBlank("1rem");
                p.addText(animationName, animation.saveName, (v) => {
                    animation.saveName = v; 
                    if ( this.editor.currentAnimation == animationName ){
                        this.updateAnimationPanel(); // update name display
                    }
                }, {placeholder: "...", width:"55%", hideName: true} );
                p.endLine();
            }

            if ( options.from && options.from.length ) {
                from = from || options.selectedFrom || options.from[0];               
                const buttons = [];
                for(let i = 0; i < options.from.length; i++) {
                    buttons.push({ value: options.from[i], callback: (v) => {from = v} });
                }
                p.addComboButtons("Save from", buttons, {selected: from});
            }

            if( options.folders && options.folders.length ) {
                folder = folder || options.selectedFolder || options.folders[0];
                const buttons = [];
                for(let i = 0; i < options.folders.length; i++) {
                    buttons.push({ value: options.folders[i], callback: (v) => {folder = v} });
                }
                p.addComboButtons("Save in", buttons, {selected: folder});
            }

            if( options.formats && options.formats.length ) {
                format = format || options.selectedFormat || options.formats[0];
                const buttons = [];
                for(let i = 0; i < options.formats.length; i++) {
                    buttons.push({ value: options.formats[i], callback: (v) => {format = v} });
                }
                p.addComboButtons("Save as", buttons, {selected: format});
            }            

            p.sameLine(2);
            let b = p.addButton("exportCancel", "Cancel", () => {if(options.on_cancel) options.on_cancel(); dialog.close();}, {hideName: true} );
            b.root.style.width = "50%";
            b = p.addButton("exportOk", options.accept || "OK", (v, e) => { 
                e.stopPropagation();
                if(options.required && value === '') {

                    text += text.includes("You must fill the input text.") ? "": "\nYou must fill the input text.";
                    dialog.close() ;
                }
                else {
                    if( callback ) {
                        callback({format, folder, from});
                    }
                    dialog.close() ;
                }
                
            }, { buttonClass: "accent", hideName: true });
            b.root.style.width = "50%";
        }, options);

        // Focus text prompt
        if( options.input !== false ) {
            dialog.root.querySelector('input').focus();
        }
    }

    updateLoopModeGui( loop ){
        this.editor.setAnimationLoop(loop);
    
        if( this.keyFramesTimeline ){
            this.keyFramesTimeline.setLoopMode(loop, true);
        }
        if( this.curvesTimeline ){
            this.curvesTimeline.setLoopMode(loop, true);
        }
        if( this.clipsTimeline ){
            this.clipsTimeline.setLoopMode(loop, true);
        }
    }

    createSceneUI(area) {

        let editor = this.editor;
        let canvasButtons = []
        
        if(editor.scene.getObjectByName("Armature")) {
            canvasButtons = [
                {
                    name: 'Skin',
                    property: 'showSkin',
                    icon: 'UserX',
                    selectable: true,
                    callback: (v) =>  {
                        editor.showSkin = !editor.showSkin;
                        let model = editor.scene.getObjectByName("Armature");
                        model.visible = editor.showSkin;
                        
                    }
                },        
                {
                    name: 'Skeleton',
                    property: 'showSkeleton',
                    icon: 'Bone@solid',
                    selectable: true,
                    selected: true,
                    callback: (v) =>  {
                        editor.showSkeleton = !editor.showSkeleton;
                        let skeleton = editor.scene.getObjectByName("SkeletonHelper");
                        skeleton.visible = editor.showSkeleton;
                        editor.scene.getObjectByName('GizmoPoints').visible = editor.showSkeleton;
                        if(!editor.showSkeleton) 
                            editor.gizmo.stop();
                    }
                }
            ];

            if( editor.gizmo ) {
                canvasButtons.push(
                    {
                        name: 'Joints',
                        property: 'boneUseDepthBuffer',
                        icon: 'CircleNodes',
                        selectable: true,
                        selected: true,
                        callback: (v) =>  {
                            if(editor.gizmo ) {
                                editor.gizmo.bonePoints.material.depthTest = !editor.gizmo.bonePoints.material.depthTest;
                            }
                        }
                    }
                );
            }            
        }
        
        canvasButtons = [...canvasButtons,
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'Grid',
                selectable: true,
                selected: true,
                callback: (v, e) => {
                    editor.showGUI = !editor.showGUI;

                    if( editor.scene.getObjectByName('Armature') ) {
                        editor.scene.getObjectByName('SkeletonHelper').visible = editor.showGUI;
                    }

                    if( editor.gizmo ) {
                        editor.scene.getObjectByName('GizmoPoints').visible = editor.showGUI;
                    }

                    editor.scene.getObjectByName('Grid').visible = editor.showGUI;
                    
                    if(!editor.showGUI) {
                        if(editor.gizmo) {
                            editor.gizmo.stop();
                        }
                        this.hideTimeline();
                        this.sidePanel.parentArea.extend();
                        this.hideVideoOverlay();
                        
                        
                    } else {
                        this.showTimeline();
                        this.sidePanel.parentArea.reduce();  
                        const currentAnim = this.editor.getCurrentAnimation();
                        if ( currentAnim && currentAnim.type == "video" ){
                            this.showVideoOverlay();
                        }
                    }                  
                }
            }
        ]
        
        area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }
    
    openSettings( settings ) {
        
        const prevDialog = document.getElementById("settings-dialog");
        if( prevDialog ) {
            prevDialog.remove();
        }
        
        const dialog = new LX.Dialog( UTILS.firstToUpperCase(settings), p => {
            if( settings == 'gizmo' ) {
                this.editor.gizmo.showOptions( p );
            }
        }, { id: 'settings-dialog', close: true, width: 380, height: 210, scroll: false, draggable: true});
    }
         
    setBoneInfoState( enabled ) {

        let gizmoMode = this.editor.getGizmoMode();

        let w = this.bonePanel.get("Position");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Translate") }); }

        w = this.bonePanel.get("Rotation (XYZ)");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Rotate")}); }

        w = this.bonePanel.get("Scale");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Scale")}); }
    }

    /** -------------------- TIMELINE -------------------- */

    drawTimeline(currentTimeline) {

        if(this.timelineVisible){ currentTimeline.draw(); }        
    }

    showTimeline() {
  
        this.timelineVisible = true;
        this.timelineArea.parentArea.reduce();
        this.editor.activeTimeline.show();
    }

    hideTimeline() {
   
        this.timelineVisible = false;
        this.timelineArea.parentArea.extend();        
        this.editor.activeTimeline.hide();
    }
    
    /** ------------------------------------------------------------ */

    /** -------------------- ON EVENTS -------------------- */
    onSelectItem(item) { // on bone select through canvas gizmo
        this.treeWidget.innerTree.select(item);
    }

    resize(width, height) {
        //this.timelineArea.setSize([width, null]);
        if ( this.editor.activeTimeline ) { 
            this.editor.activeTimeline.resize();
            if( this.propagationWindow ) {
                this.propagationWindow.updateCurve(true);
            } // resize
        }
    }

    async promptExit() {
        this.prompt = await new LX.Dialog("Exit confirmation", (p) => {
            p.addTextArea(null, "Be sure you have exported the animation. If you exit now, your data will be lost. How would you like to proceed?", null, {disabled: true});
            p.addButton(null, "Export", () => {
                p.clear();
                p.addText("File name", this.editor.clipName, (v) => this.editor.clipName = v);
                p.addButton(null, "Export extended BVH", () => this.editor.export(null, "BVH extended"), { buttonClass: "accent" });
                if(this.editor.mode == this.editor.editionModes.SCRIPT) {
                    p.addButton( null, "Export BML", () => this.editor.export(null, ""), { buttonClass: "accent" });
                }
                p.addButton( null, "Export GLB", () => this.editor.export(null, "GLB"), { buttonClass: "accent" });
            });
            p.addButton(null, "Discard", () => {

            });
            p.addButton(null, "Cancel", () => {
                return;
            });

        }, {
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
        }, {modal: true, closable: true});
        return this.prompt;
    }

    showClearTracksConfirmation(callback) {
        this.prompt = new LX.prompt("Are you sure you want to delete all the tracks? You won't be able to restore the animation.", "Clear all tracks", callback, {input:false},  
        {
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
        } );
    }

    closeDialogs() {
        if(!LX.modal.hidden)
            LX.modal.toggle(true);
        if(this.prompt) {
            this.prompt.close();
            this.prompt = null;
            
        }
    }

    createLoadingModal(options) {
        options = options || {size: ["80%", "70%"]};

        return new LX.Dialog(null, m => {
            const div = document.createElement("div");
            div.classList.add("load")

            const icon = document.createElement("div");
            icon.classList = "loading-icon big";
            div.appendChild(icon);
            
            const text = document.createElement("div");
            text.innerText = "Loading content...";
            text.style.margin = "-5px 14px";
            div.appendChild(text);
            const area = new LX.Area(options);
            area.attach(div);
            m.attach(area);
        }, options);
    }

    // inserts an area that covers the panel with a loading message. Can be hidden/shown hidden. The new area's parent will have position:relative
    createLoadingArea(panel, options) {
        options = options ?? {size: ["100%", "100%"]};

        const div = document.createElement("div");
        div.classList.add("load");

        const icon = document.createElement("div");
        icon.classList = "loading-icon big";
        div.appendChild(icon);
        
        const text = document.createElement("div");
        text.innerText = "Loading content...";
        text.style.margin = "-5px 14px";
        div.appendChild(text);
        const area = new LX.Area(options);
        area.attach(div);

        area.root.style.minWidth = "100%";
        area.root.style.minHeight = "100%";
        area.root.style.top = 0;
        area.root.style.left = 0;
        area.root.style.position = "absolute";
        area.root.style.zIndex = 100;

        panel.attach(area);
        area.root.parentElement.style.position = "relative";
        return area;
    }

    highlightSelector( ) {
        const el = document.getElementById("animation-selector");
        if( el ) {
            el.getElementsByClassName("lexbutton")[0].classList.add("highlight-border");
        }
    }
};

class KeyframesGui extends Gui {

    constructor(editor) {
        
        super(editor);
        this.mode = ClipModes.Keyframes;
        this.showVideo = false;
        this.skeletonScroll = 0;

        this.inputVideo = null;
        this.recordedVideo = null;
        this.canvasVideo = null;

        this.captureMode = editor.mode;

        this.faceAreas = {
            "rgb(255,0,255)": "Brow Left",
            "rgb(0,0,255)": "Brow Right",
            "rgb(0,255,0)": "Eye Left",
            "rgb(0,255,255)": "Eye Right",
            "rgb(255,0,0)": "Nose", 
            "rgb(255,255,0)": "Cheek Left",
            "rgb(255,255,255)": "Cheek Right",
            "rgb(125,0,0)": "Mouth",
            "rgb(0,125,0)": "Jaw"
        };

        this.boneProperties = {};
        this.createVideoOverlay();       
    }

    onCreateMenuBar( menubar ) {    
        
        menubar.add("Project/Generate animations", {icon: "HandsAslInterpreting"});
        menubar.add("Project/Generate animations/From webcam", {icon: "Webcam", callback: () => this.editor.captureVideo()});
        menubar.add("Project/Generate animations/From videos", {icon: "Film", callback: () => this.importFiles(), short: "CTRL+O"});
       
        // Export (download) animation
        menubar.add("Project/Export animations", {short: "CTRL+E", icon: "Download", callback: () => {            
            this.showExportAnimationsDialog("Export animations", ( info ) => this.editor.export( this.editor.getAnimationsToExport(), info.format ), {formats: ["BVH", "BVH extended", "GLB"]});
        }});
       
        menubar.add("Project/Export videos & landmarks", {icon: "FileVideo", callback: () => this.showExportVideosDialog() });

        // Save animation in server
        menubar.add("Project/Save animation", {short: "CTRL+S", callback: () => this.createSaveDialog(), icon: "Save"});

        menubar.add("Project/Preview in PERFORMS", {icon: "StreetView",  callback: () => this.editor.showPreview() });
        
        menubar.add("Timeline/Shortcuts/Move keys", { short: "Hold CTRL" });
        menubar.add("Timeline/Shortcuts/Change value keys (face)", { short: "ALT + Left Click + drag" });
        menubar.add("Timeline/Shortcuts/Add keys", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Copy keys", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Copy keys", { short: "CTRL+C" });
        menubar.add("Timeline/Shortcuts/Paste keys", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Paste keys", { short: "CTRL+V" });
        menubar.add("Timeline/Shortcuts/Delete keys");
        menubar.add("Timeline/Shortcuts/Delete keys/Single", { short: "DEL" });
        menubar.add("Timeline/Shortcuts/Delete keys/Multiple", { short: "Hold LSHIFT" });
        menubar.add("Timeline/Shortcuts/Key selection");
        menubar.add("Timeline/Shortcuts/Key selection/Single", { short: "Left Click" });
        menubar.add("Timeline/Shortcuts/Key selection/Multiple", { short: "Hold LSHIFT" });
        menubar.add("Timeline/Shortcuts/Key selection/Box", { short: "Hold LSHIFT+Drag" });
        menubar.add("Timeline/Shortcuts/Propagation window/", { short: "W" });
        menubar.add("Timeline/Optimize all tracks", { callback: () => {
                // optimize all tracks of current binded animation (if any)
                this.curvesTimeline.optimizeTracks(); // onoptimizetracks will call updateActionUnitPanel
                this.keyFramesTimeline.optimizeTracks();
            }
        });

        menubar.add("View/Gizmo settings", { type: "button", callback: (v) => {
            this.openSettings("gizmo");
        }});
             
        menubar.add("Help/Tutorial", {callback: () => window.open("docs/keyframe_animation.html", "_blank")});        
    }

    createBlendShapesInspector(bsNames, options = {}) {
        
        let inspector = options.inspector || new LX.Panel({id:"blendshapes-inspector"});
        
        if(options.clear)
            inspector.clear();
            
        if(inspector.id)
            inspector.addTitle(inspector.id);

        for(let name in bsNames) {
    
            inspector.addProgress(name, 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, editable: options.editable, showNumber: options.showNumber, signal: "@on_change_au_" + name});
        }
        
        return inspector;
    } 

    createVideoOverlay() {
        
        const width = 300;
        const height = 300;

        const area = new LX.Area({                
            id: "editor-video", draggable: true, resizeable: true, width: width + "px", height: height + "px", overlay:"left", left: "20px", top: "20px"
        });
        area.root.style.background = "#00000017";
        area.root.style.borderRadius = "5px";
        area.root.style.overflow = "none";
        
        const video = this.editor.video; 
        video.style.width = "99%";       
        video.style.height = "auto";
        // video.style.borderRadius = "5px";
       
        area.attach(video);
        this.canvasArea.attach(area);

        // adjust div to video aspect ratio. This forces the resizing tool to be on the video
        area.root.onmouseup = ( event ) => {
            // this == area
            const v = video;
            const aspectRatio = v.videoWidth / v.videoHeight;
            const currentRatio = area.root.clientWidth / area.root.clientHeight;
            if ( currentRatio < aspectRatio ){ // div higher than the video
                let lastHeight = area.root.clientHeight;
                let newHeight = area.root.clientWidth / aspectRatio;
                area.root.style.height = newHeight + "px";
                area.root.style.top = (area.root.offsetTop + 0.5 * ( lastHeight - newHeight ) ) + "px";            
            }
            else { // div wider than the video
                let lastWidth = area.root.clientWidth;
                let newWidth = area.root.clientHeight * aspectRatio;
                area.root.style.width = newWidth + "px";
                area.root.style.left = (area.root.offsetLeft + 0.5 * ( lastWidth - newWidth ) ) + "px";
            }

            this.computeVideoArea(event.rect);
        }
        this.hideVideoOverlay();
    }
    
    /**
     * 
     * @param {object} rect normalized rect coordinates { left, top, width, height } 
     * @returns 
     */
    computeVideoArea( rect ) {
        const videoRect = this.editor.video.getBoundingClientRect();
        if( !rect ) {
            rect = this.editor.getCurrentAnimation().rect;
            if( !rect ) {
                return;
            }
        }

        this.editor.video.style.webkitMask = `linear-gradient(#000 0 0) ${rect.left * videoRect.width}px ${rect.top * videoRect.height}px / ${videoRect.width*rect.width}px ${videoRect.height*rect.height}px, linear-gradient(rgba(0, 0, 0, 0.3) 0 0)`;
        this.editor.video.style.webkitMaskRepeat = 'no-repeat';
    }

    showVideoOverlay( needsMirror = false ) {
        const el = document.getElementById("editor-video");
        if( el ) {
            el.classList.remove("hidden");
            const video = this.editor.video;
            
            // Mirror the video
            if( needsMirror ) {
                video.classList.add("mirror");
            }
            else {
                video.classList.remove("mirror");
            }
        }        
    }
    
    hideVideoOverlay() {
        const el = document.getElementById("editor-video");
        if( el ) {
            el.classList.add("hidden");
        }
    }

    showExportVideosDialog() {

        let animations = this.editor.loadedAnimations;
        let toExport = {}; // need to sepparate bvh anims from video anims (just in case)
        for ( let aName in animations ){
            if ( animations[aName].type == "video" ){
                toExport[ aName ] = animations[aName];
            }
        }

        if( !Object.keys(toExport).length ) {
            LX.popup("There aren't videos or landmarks to export!", "", {position: [ "10px", "50px"], timeout: 5000})
            return;
        }

        const zip = new JSZip();

        const options = { modal : true };
        const dialog = this.prompt = new LX.Dialog("Export videos and Mediapipe data", p => {
            
            // animation elements
            for( let aName in toExport ) {
                const anim = toExport[aName];
                p.sameLine();
                p.addCheckbox(" ", anim.export, (v) => anim.export = v);//, {minWidth:"100px"});
                p.addText(aName, anim.saveName, (v) => {
                    toExport[aName].saveName = v;
                }, {placeholder: "...", minWidth:"200px"} );
                p.endLine();
            }

            // accept / cancel
            p.sameLine(2);
            p.addButton("", options.accept || "Download", async (v, e) => { 
                e.stopPropagation();
                
                UTILS.makeLoading( "Preparing files...", 0.5 );
                const promises = [];

                for( let aName in toExport ) {
                    const animation = toExport[aName];
                    if ( !animation.export ) {
                        continue;
                    }
                    let extension = aName.lastIndexOf(".");
                    extension = extension == -1 ? ".webm" : aName.slice(extension);
                    const saveName = animation.saveName + extension;

                    // prepare videos so they can be downloaded
                    const promise = fetch( animation.videoURL )
                        .then( r => r.blob() )
                        .then( blob => UTILS.blobToBase64(blob) )
                        .then( binaryData => zip.file(saveName, binaryData, {base64:true} ) );
                    
                    promises.push( promise );

                    // include landmarks in zip
                    // TODO: optimize json so it weights less
                    let data = {
                        startTime: animation.startTime,
                        endTime: animation.endTime,
                        landmarks: animation.landmarks,
                        blendshapes: animation.blendshapes
                    };

                    data = JSON.stringify( data, 
                        function(key, val) {
                            return (val !== null && val !== undefined && val.toFixed) ? Number(val.toFixed(4)) : val;
                        } 
                    );

                    zip.file( animation.saveName + ".json", data );
                }

                dialog.close();

                // wait until all videos have been added to the zip before downloading
                await Promise.all( promises );

                const base64 = await zip.generateAsync({type:"base64"});
                const el = document.createElement("a"); 
                el.href = "data:application/zip;base64," + base64;
                el.download = "videos.zip";
                el.click();
                UTILS.hideLoading();

            }, { buttonClass: "accent" });
            
            p.addButton("", "Cancel", () => {
                if(options.on_cancel) {
                    options.on_cancel();
                }
                dialog.close();
            });

        }, options);

        // Focus text prompt
        if(options.input !== false) {
            dialog.root.querySelector('input').focus();
        }
    }

    /** Create timelines */
    createTimelines( ) {                    

        /* Keyframes Timeline */
        this.keyFramesTimeline = new LX.KeyFramesTimeline("Bones", {
            onCreateBeforeTopBar: (panel) => {
                panel.addSelect("Animation", Object.keys(this.editor.loadedAnimations), this.editor.currentAnimation, (v)=> {
                    this.editor.bindAnimationToCharacter(v);
                    this.updateAnimationPanel();
                }, {signal: "@on_animation_loaded", id:"animation-selector", nameWidth: "auto"})
                
            },
            onCreateSettingsButtons: (panel) => {
                panel.addButton("", "Clear track/s", (value, event) =>  {
                    this.editor.clearAllTracks();     
                    this.updateAnimationPanel();
                }, {icon: 'Trash2', width: "40px"});                
            },
            onChangeLoopMode: (loop) => {
                this.updateLoopModeGui( loop );
            },
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Framerate", this.editor.animationFrameRate, (v) => {
                    this.editor.animationFrameRate = v;
                }, {min: 0, disabled: false});
                dialog.addNumber("Num items", Object.keys(this.keyFramesTimeline.animationClip.tracksPerItem).length, null, {disabled: true});
                dialog.addNumber("Num tracks", this.keyFramesTimeline.animationClip ? this.keyFramesTimeline.animationClip.tracks.length : 0, null, {disabled: true});
                dialog.addNumber("Optimize Threshold", this.keyFramesTimeline.optimizeThreshold ?? 0.01, v => {
                        this.keyFramesTimeline.optimizeThreshold = v;
                    }, {min: 0, max: 1, step: 0.001, precision: 4}
                );

                dialog.branch("Propagation Window");
                // this.propagationWindowConfig(dialog);
                this.propagationWindow.onOpenConfig(dialog);
                dialog.merge();
            },
            disableNewTracks: true
        });

        this.propagationWindow = new PropagationWindow( this.keyFramesTimeline );

        this.keyFramesTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.keyFramesTimeline.onMouse = this.propagationWindow.onMouse.bind(this.propagationWindow);
        this.keyFramesTimeline.onDblClick = this.propagationWindow.onDblClick.bind(this.propagationWindow);
        this.keyFramesTimeline.onBeforeDrawContent = this.propagationWindow.draw.bind(this.propagationWindow);

        this.keyFramesTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").children[0].children[0].click();
            }
        }
        this.keyFramesTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").children[0].children[0].click();
        }
        this.keyFramesTimeline.onSetSpeed = (v) => this.editor.setPlaybackRate(v);
        this.keyFramesTimeline.onSetTime = (t) => {
            this.editor.setTime(t, true);
            this.propagationWindow.setTime(t);
        }
        this.keyFramesTimeline.onSetDuration = (t) => { 
            let currentBinded = this.editor.getCurrentBindedAnimation();
            if (!currentBinded){ return; }
            currentBinded.mixerBodyAnimation.duration = t;
            currentBinded.mixerFaceAnimation.duration = t;
            currentBinded.auAnimation.duration = t;

            if( this.curvesTimeline.duration != t ){
	            this.curvesTimeline.setDuration(t, true, true);			
			}
        };

        this.keyFramesTimeline.onContentMoved = (trackIdx, keyframeIdx)=> this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, trackIdx);
        this.keyFramesTimeline.onDeleteKeyFrame = (trackIdx, tidx) => this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, trackIdx);
        this.keyFramesTimeline.onSelectKeyFrame = (e, info) => {
            this.propagationWindow.setTime( this.keyFramesTimeline.currentTime );

            if(e.button != 2) {
                //this.editor.gizmo.mustUpdate = true
                this.editor.gizmo.update(true);
                this.updateSkeletonPanel();
                this.editor.gizmo._setBoneById( this.editor.gizmo.selectedBone );
                if ( this.propagationWindow.enabler ){
                    this.keyFramesTimeline.unSelectAllKeyFrames();
                }
                return false;
            }
            return true; // Handled
        };

        this.keyFramesTimeline.onUnselectKeyFrames = (keyframes) => {
            this.editor.gizmo.stop();
        }

        
        this.keyFramesTimeline.showContextMenu =  ( e ) => {
            
            e.preventDefault();
            e.stopPropagation();

            let actions = [];
            //let track = this.NMFtimeline.clip.tracks[0];
            if(this.keyFramesTimeline.lastKeyFramesSelected && this.keyFramesTimeline.lastKeyFramesSelected.length) {
                if(this.keyFramesTimeline.lastKeyFramesSelected.length == 1 && this.keyFramesTimeline.clipboard && this.keyFramesTimeline.clipboard.value)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => {
                                let [id, localTrackIdx, keyIdx, trackIdx] = this.keyFramesTimeline.lastKeyFramesSelected[0];
                                this.pasteKeyFrameValue(e, this.keyFramesTimeline.animationClip.tracksPerItem[id][localTrackIdx], keyIdx);
                                this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, trackIdx);
                            }
                        }
                    )
                }
                actions.push(
                    {
                        title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => this.keyFramesTimeline.copySelectedContent()
                    }
                )
                actions.push(
                    {
                        title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                        callback: () => {
                            this.keyFramesTimeline.deleteSelectedContent();
                            this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, -1);
                        }
                    }
                )
            }
            else {
                if(!e.track) {
                    return;
                }
                
                let [name, type] = [e.track.name, e.track.type]
                if(this.boneProperties[type]) {
                    
                    actions.push(
                        {
                            title: "Add",
                            callback: () => {
                                this.keyFramesTimeline.addKeyFrame( e.track, this.boneProperties[type].toArray() )
                                this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, -1);
                            }
                        }
                    )
                }

                if(this.clipboard && this.clipboard.keyframes)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => {
                                this.pasteContent()
                                this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, -1);
                            }
                        }
                    )
                }
            }
            
            LX.addContextMenu("Options", e, (m) => {
                for(let i = 0; i < actions.length; i++) {
                    m.add(actions[i].title,  actions[i].callback )
                }
            });

        }

        this.keyFramesTimeline.onItemUnselected = () => this.editor.gizmo.stop();
        this.keyFramesTimeline.onUpdateTrack = (idx) => this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, idx);
        this.keyFramesTimeline.onGetSelectedItem = () => { return this.editor.getSelectedBone(); };
        this.keyFramesTimeline.onChangeTrackVisibility = (track, oldState) => {this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, track.clipIdx);}
        this.keyFramesTimeline.onOptimizeTracks = (idx = null) => { 
            this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, idx);
        }
        this.editor.activeTimeline = this.keyFramesTimeline;

        /* Curves Timeline */
        this.curvesTimeline = new LX.CurvesTimeline("Action Units", {
            onCreateBeforeTopBar: (panel) => {
                panel.addSelect("Animation", Object.keys(this.editor.loadedAnimations), this.editor.currentAnimation, (v)=> {
                    this.editor.bindAnimationToCharacter(v);
                    this.updateAnimationPanel();
                }, {signal: "@on_animation_loaded"})
            },
            onChangeLoopMode: (loop) => {
                this.updateLoopModeGui( loop );
            }, 
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Framerate", this.editor.animationFrameRate, (v) => {
                    this.editor.animationFrameRate = v;
                }, {min: 0, disabled: false});
                dialog.addNumber("Num items", Object.keys(this.curvesTimeline.animationClip.tracksPerItem).length, null, {disabled: true});
                dialog.addNumber("Num tracks", this.curvesTimeline.animationClip ? this.curvesTimeline.animationClip.tracks.length : 0, null, {disabled: true});
                dialog.addNumber("Optimize Threshold", this.curvesTimeline.optimizeThreshold ?? 0.01, v => {
                        this.curvesTimeline.optimizeThreshold = v;
                    }, {min: 0, max: 1, step: 0.001, precision: 4}
                );

                dialog.branch("Propagation Window");
                // this.propagationWindowConfig(dialog);
                this.propagationWindow.onOpenConfig(dialog);

                dialog.merge();
            },
            disableNewTracks: true
        });

        this.curvesTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.curvesTimeline.onMouse = this.propagationWindow.onMouse.bind(this.propagationWindow);
        this.curvesTimeline.onDblClick = this.propagationWindow.onDblClick.bind(this.propagationWindow);
        this.curvesTimeline.onBeforeDrawContent = this.propagationWindow.draw.bind(this.propagationWindow);

        this.curvesTimeline.onSetSpeed = (v) => this.editor.setPlaybackRate(v);
        this.curvesTimeline.onSetTime = (t) => {
            this.editor.setTime(t, true);
            this.propagationWindow.setTime(t);
            if ( !this.editor.state ){ // update ui if not playing
                this.updateActionUnitsPanel(this.curvesTimeline.animationClip);
            }
        }
        this.curvesTimeline.onSetDuration = (t) => { 
            let currentBinded = this.editor.getCurrentBindedAnimation();
            if (!currentBinded){ return; }
            currentBinded.mixerBodyAnimation.duration = t;
            currentBinded.mixerFaceAnimation.duration = t;
            currentBinded.auAnimation.duration = t;

            if( this.keyFramesTimeline.duration != t ){
	            this.keyFramesTimeline.setDuration(t, true, true);			
			}
        };

        this.curvesTimeline.onContentMoved = (trackIdx, keyframeIdx)=> this.editor.updateAnimationAction(this.curvesTimeline.animationClip, trackIdx);
        this.curvesTimeline.onUpdateTrack = (idx) => {
            this.editor.updateAnimationAction(this.curvesTimeline.animationClip, idx); 
            this.updateActionUnitsPanel(this.curvesTimeline.animationClip, idx)
        }
        this.curvesTimeline.onDeleteKeyFrame = (trackIdx, tidx) => this.editor.updateAnimationAction(this.curvesTimeline.animationClip, trackIdx);
        this.curvesTimeline.onGetSelectedItem = () => { return this.editor.getSelectedActionUnit(); };
        this.curvesTimeline.onSelectKeyFrame = (e, info) => {
            this.propagationWindow.setTime( this.curvesTimeline.currentTime );

            if(e.button != 2) {
                this.updateActionUnitsPanel(this.curvesTimeline.animationClip, info[3]);
                if ( this.propagationWindow.enabler ){
                    this.curvesTimeline.unSelectAllKeyFrames();
                }
                return false;
            }
            return true; // Handled
        };
        
        this.curvesTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").children[0].children[0].click();
            }
        }
        this.curvesTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").children[0].children[0].click();
        }
        this.curvesTimeline.onOptimizeTracks = (idx = null) => { 
            this.editor.updateAnimationAction(this.curvesTimeline.animationClip, idx);
            this.updateActionUnitsPanel(this.curvesTimeline.animationClip, idx < 0 ? undefined : idx);
        }
        this.curvesTimeline.onChangeTrackVisibility = (track, oldState) => {this.editor.updateAnimationAction(this.curvesTimeline.animationClip, track.clipIdx);}


        this.timelineArea.attach(this.keyFramesTimeline.mainArea);
        this.timelineArea.attach(this.curvesTimeline.mainArea);
        this.keyFramesTimeline.hide();
        this.curvesTimeline.hide();
    }
    
    
    changeCaptureGUIVisivility(hidden) {
        this.bsInspector.root.hidden = hidden || !this.bsInspector.root.hidden;
    }

    updateCaptureGUI(results, isRecording) {
        // update blendshape inspector both in capture and edition stages

        let {landmarksResults, blendshapesResults} = results;
       

        if(landmarksResults) {
            this.bsInspector.get('Distance to the camera').onSetValue( landmarksResults.distanceToCamera ?? 0 );
            this.bsInspector.get('Left Hand visibility').onSetValue( landmarksResults.leftHandVisibility ?? 0 );
            this.bsInspector.get('Right Hand visibility').onSetValue( landmarksResults.rightHandVisibility ?? 0 );
        }        

        if(blendshapesResults && (!this.bsInspector.root.hidden || this.facePanel && !this.facePanel.root.hidden )) {

            for(let i in blendshapesResults)
            {
                
                let value = blendshapesResults[i];
                value = value.toFixed(2);
                let widget = this.bsInspector.root.hidden ? this.facePanel.tabs[this.facePanel.selected].get(i) : this.bsInspector.get(i);
                if(!widget)
                    continue;
                widget.onSetValue(value);
            // TO DO: emit @on_change_au_ + name
            }
        }
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {
        const [top, bottom] = this.sidePanel.split({id: "panel", type: "vertical", sizes: ["auto", "auto"], resize: false});
       
        this.animationPanel = new LX.Panel({id:"animation"});
        top.attach(this.animationPanel);
        this.updateAnimationPanel( );

        //create tabs
        const tabs = bottom.addTabs({fit: true});

        const bodyArea = new LX.Area({id: 'Body'});  
        const faceArea = new LX.Area({id: 'Face'});  
        tabs.add( "Body", bodyArea, {selected: true, onSelect: (e,v) => {
            this.editor.setTimeline(this.editor.animationModes.BODY)
            // this.updatePropagationWindowCurve();
            this.propagationWindow.setTimeline( this.keyFramesTimeline );
        }}  );
        

        tabs.add( "Face", faceArea, { onSelect: (e,v) => {
            this.editor.setTimeline(this.editor.animationModes.FACE); 
            this.selectActionUnitArea(this.editor.getSelectedActionUnit());
            // this.updatePropagationWindowCurve();
            this.propagationWindow.setTimeline( this.curvesTimeline );
            this.imageMap.resize();
        } });

        faceArea.split({type: "vertical", sizes: ["50%", "50%"], resize: true});
        const [faceTop, faceBottom] = faceArea.sections;
        faceTop.root.style.minHeight = "20px";
        faceTop.root.style.height = "50%";
        faceBottom.root.style.minHeight = "20px";
        faceBottom.root.style.height = "50%";
        faceBottom.root.classList.add("overflow-y-auto");
        this.createFacePanel(faceTop);
        this.createActionUnitsPanel(faceBottom);

        bodyArea.split({type: "vertical", resize: true, sizes: "auto"});
        const [bodyTop, bodyBottom] = bodyArea.sections;
        this.createSkeletonPanel( bodyTop, {firstBone: true, itemSelected: this.editor.currentCharacter.skeletonHelper.bones[0].name} );
        this.createBonePanel( bodyBottom );
        

        this.sidePanel.onresize = (e)=>{
            if (faceTop.onresize){
                faceTop.onresize(e);
            }
        }
    }

    updateAnimationPanel( options = {}) {
        let widgets = this.animationPanel;

        widgets.onRefresh = (o) => {

            o = o || {};
            widgets.clear();
            widgets.addTitle("Animation");

            let anim = this.editor.getCurrentAnimation() ?? {}; // loadedAnimations[current]
            let saveName = anim ? anim.saveName : "";
            widgets.addText("Name", saveName || "", (v) =>{ 
                anim.saveName = v; 
            } )

            widgets.addSeparator();
        }
        widgets.onRefresh(options);
    }

    createFacePanel(area, itemSelected, options = {}) {

        const padding = 16;
        const container = document.createElement("div");
        container.id = "faceAreasContainer";
        container.style.paddingTop = padding + "px";
        const colorShceme = document.documentElement.getAttribute("data-theme");
        container.style.filter = colorShceme == "dark" ? "" : "invert(1) saturate(1) hue-rotate(180deg)";
        container.style.height = "100%";
        container.style.width = "100%";
        container.style.alignItems = "center";

        const img = document.createElement("img");
        img.src = "./data/imgs/masks/face areas2.png";
        img.setAttribute("usemap", "#areasmap");
        img.style.position = "relative";
        container.appendChild(img);
        
        
        const map = document.createElement("map");
        map.name = "areasmap";

        const div = document.createElement("div");
        div.style.position = "fixed";
        const mapHovers = document.createElement("div");
        for(let area in this.faceAreas) {
            let maparea = document.createElement("area");
            maparea.title = this.faceAreas[area];
            maparea.shape = "poly";
            maparea.name = this.faceAreas[area];
            switch(this.faceAreas[area]) {
                case "Eye Left":
                    maparea.coords = "305,325,377,316,449,341,452,366,314,377,301,366";
                    break;
                    case "Eye Right":
                    maparea.coords = "76,347,145,317,212,318,225,327,228,366,212,379,92,375";
                    break;
                case "Mouth":
                    maparea.coords = "190,508,204,500,311,500,327,506,350,537,350,554,338,566,304,577,214,582,157,566,166,551,166,540"//"196,504,314,504,352,550,331,572,200,578,167,550";
                    break;
                case "Nose":
                    maparea.coords = "244,332,286,331,316,478,286,488,244,488,206,483";
                    break;
                case "Brow Left":
                    maparea.coords = "279,269,375,262,467,317,465,317,465,336,392,310,285,321";
                    break;
                case "Brow Right":
                    maparea.coords = "252,269,142,264,66,314,69,314,69,333,133,307,264,321";
                    break;
                case "Cheek Left":
                    maparea.coords = "305,384,378,388,441,380,461,389,463,409,436,507,390,582,357,532,333,499,321,451";
                    break;
                case "Cheek Right":
                    maparea.coords = "69,388,83,377,139,387,216,384,193,482,185,499,159,533,123,584,82,496";
                    break;
                case "Jaw":
                    maparea.coords = "155,569,184,583,258,592,342,579,364,567,377,597,311,666,259,681,205,671,132,610,130,595";
                    break;
            }
            maparea.src = "./data/imgs/masks/"+ maparea.name + " selected.png";
            map.appendChild(maparea);
            let imgHover = document.createElement("img");
            imgHover.src = "./data/imgs/masks/"+ maparea.name + " selected.png";
            imgHover.alt = maparea.name;
            imgHover.style.display = "none";
            imgHover.style.position = "relative";
            imgHover.style.height = "100%";
            mapHovers.appendChild(imgHover);
        }
        div.appendChild(mapHovers);
        mapHovers.style.position = "relative";
        container.appendChild(div);
        area.root.appendChild(container);
        container.appendChild(map);
        
        container.style.height = "100%";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        
        map.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectActionUnitArea(e.target.name);
            this.showTimeline();
            this.propagationWindow.updateCurve(true); // resize

            img.src = "./data/imgs/masks/face areas2 " + e.target.name + ".png";
            document.getElementsByClassName("map-container")[0].style.backgroundImage ="url('" +img.src +"')";

        });

        img.onload = (e) =>
        {
            let w = img.width;
            let h = img.height;
            img.style.height = "100%";
            if(!this.imageMap) {

                this.imageMap = new ImageMap(map, img, w, h);
            }
        }

        var ImageMap = function(map, img, w, h){
            var n,
                areas = map.getElementsByTagName('area'),
                len = areas.length,
                coords = [],
                aspectRatio = w / h,
                previousWidth = w,
                previousHeight = h;
            for (n = 0; n < len; n++) {
                coords[n] = areas[n].coords.split(',');
            }
            this.img = img;
            this.highlighter = new ImageMapHighlighter(img, {
                strokeColor: '67aae9',
                lineJoin: "round", 
                lineCap: "round"
            });
            this.highlighter.init();
           
            this.resize =  () => {
                var n, m, clen;
                let newHeight = Math.max( Math.min( area.root.clientWidth / aspectRatio, area.root.clientHeight ) - padding, 0.01 );
                let x = newHeight / previousHeight;
                for (n = 0; n < len; n++) {
                    clen = coords[n].length;
                    for (m = 0; m < clen; m++) {
                        coords[n][m] *= x;
                    }
                    areas[n].coords = coords[n].join(',');
                }
                previousWidth = newHeight * aspectRatio;
                previousHeight = newHeight;
                this.highlighter.element.parentElement.querySelector("canvas").width = previousWidth;
                this.highlighter.element.parentElement.querySelector("canvas").height = previousHeight;
                this.highlighter.element.parentElement.style.width = previousWidth + "px";
                this.highlighter.element.parentElement.style.height = previousHeight + "px";
                return true;
            };
            area.onresize = this.resize;
        }

    }

    createActionUnitsPanel(root) {
        let tabs = root.addTabs({fit:true});
        let areas = {};
        
        const animation = this.curvesTimeline.animationClip;

        for(let i in this.editor.mapNames) {
            for(let item in this.faceAreas) {
                let toCompare = this.faceAreas[item].toLowerCase().split(" ");
                let found = true;
                for(let j = 0; j < toCompare.length; j++) {
    
                    if(!i.toLowerCase().includes(toCompare[j])) {
                        found = false;
                        break;
                    }
                }
                if(found)
                {
                    if(!areas[this.faceAreas[item]])
                        areas[this.faceAreas[item]] = {};
                    areas[this.faceAreas[item]][i] =  this.editor.mapNames[i];
                }
            }
        }

        for(let area in areas) {
            let panel = new LX.Panel({id: "au-"+ area});
            
            panel.clear();
            panel.addTitle(area, { style: {background: "none", fontSize:"large", margin: "auto"}});
            panel.addBlank();

            for(let name in areas[area]) {
                for(let i = 0; i < animation.tracks.length; i++) {
                    const track = animation.tracks[i];
                    if(track.name == area && track.type == name) {
                        let frame = this.curvesTimeline.getCurrentKeyFrame(track, this.curvesTimeline.currentTime, 0.1);
                        frame = frame == -1 ? 0 : frame;
                        if( (!this.curvesTimeline.lastKeyFramesSelected.length || this.curvesTimeline.lastKeyFramesSelected[0][2] != frame)) {
                            this.curvesTimeline.selectKeyFrame(track, frame);
                        }

                        panel.addNumber(name, track.values[frame], (v,e) => {                           
                            this.editor.updateBlendshapesProperties(name, v);
                        }, {min: 0, max: 1, step: 0.01, signal: "@on_change_" + name, onPress: ()=>{ this.curvesTimeline.saveState(track.clipIdx) }});
                        break;
                    }
                }
            }
                        
            tabs.add(area, panel, { selected: this.editor.getSelectedActionUnit() == area, onSelect : (e, v) => {
                    this.showTimeline();
                    this.editor.setSelectedActionUnit(v);
                    document.getElementsByClassName("map-container")[0].style.backgroundImage ="url('" +"./data/imgs/masks/face areas2 " + v + ".png"+"')";
                    this.propagationWindow.updateCurve(true); // resize
                }
            });
        }

        tabs.root.classList.add("hidden"); // hide tab titles only
        this.facePanel = tabs;

    }

    selectActionUnitArea( area ) {
        if(!this.facePanel ) {
            return;
        }
        this.facePanel.select(area);
    }

    /**
     * 
     * @param {auAnimation} animation 
     * @param {Number} trackIdx if undefined, updates the currently visible tracks only 
     * @returns 
     */
    updateActionUnitsPanel(animation = this.curvesTimeline.animationClip, trackIdx) {
        if(trackIdx == undefined) {

            const selectedItems = this.curvesTimeline.selectedItems;
            const tracksPerItem = this.curvesTimeline.animationClip.tracksPerItem;
            for( let i = 0; i < selectedItems.length; ++i ){
                const itemTracks = tracksPerItem[selectedItems[i]] || [];
                for( let t = 0; t < itemTracks.length; ++t ){
					const track = itemTracks[t];
                    let frame = this.curvesTimeline.getNearestKeyFrame(track, this.curvesTimeline.currentTime);
                    if ( frame > -1 ){
                        LX.emit("@on_change_" + track.type, track.values[frame]);
                    }
                }
            }
            return;
        }

        const track = animation.tracks[trackIdx];
        let name = track.type;
        let frame = 0;
        if(this.curvesTimeline.lastKeyFramesSelected.length && this.curvesTimeline.lastKeyFramesSelected[0][0] == name) {
            frame = this.curvesTimeline.lastKeyFramesSelected[0][2];
        } 
        else {            
            frame = this.curvesTimeline.getNearestKeyFrame(track, this.curvesTimeline.currentTime);
        }
        if( frame > -1 ){
            LX.emit("@on_change_" + name, track.values[frame]);
        }
    }

    createSkeletonPanel(root, options) {

        let skeletonPanel = new LX.Panel({id:"skeleton"});
        root.attach(skeletonPanel);

        options = options || {};
        this.boneProperties = {};
        this.editor.selectedBone = options.itemSelected ?? this.editor.selectedBone;
        
        const mytree = this.updateNodeTree();
    
        this.treeWidget = skeletonPanel.addTree("Skeleton bones", mytree, { 
            // icons: tree_icons, 
            filter: true,
            onevent: (event) => { 
                console.log(event.string());
    
                switch(event.type) {
                    case LX.TreeEvent.NODE_SELECTED: 
                        if(event.multiple)
                            console.log("Selected: ", event.node); 
                        else {
                            if(!this.editor){
                                throw("No editor attached");
                            }
                            
                            const itemSelected = event.node.id;
                            if ( itemSelected != this.editor.selectedBone ){
                                this.editor.setSelectedBone( itemSelected );
                            }
                            this.showTimeline();
                            console.log(itemSelected + " selected"); 
                        }
                        break;
                    case LX.TreeEvent.NODE_DBLCLICKED: 
                        console.log(event.node.id + " dbl clicked"); 
                        break;
                    case LX.TreeEvent.NODE_CONTEXTMENU: 
                        console.log(event.node.id + " context menu");
                        break;
                    case LX.TreeEvent.NODE_DRAGGED: 
                        console.log(event.node.id + " is now child of " + event.value.id); 
                        break;
                    case LX.TreeEvent.NODE_RENAMED:
                        console.log(event.node.id + " is now called " + event.value); 
                        break;
                    case LX.TreeEvent.NODE_VISIBILITY:
                        const tracksInItem = this.keyFramesTimeline.animationClip.tracksPerItem[event.node.id];
                        for( let i = 0; i < tracksInItem.length; ++i ){
                            this.keyFramesTimeline.changeTrackVisibility(tracksInItem[i].clipIdx, event.value);
                        }
                        console.log(event.node.id + " visibility: " + event.value); 
                        break;
                }
            },
        });
    }

    updateNodeTree() {
        
        const rootBone = this.editor.currentCharacter.skeletonHelper.bones[0];
        
        let mytree = { 
            id: rootBone.name, 
            // selected: rootBone.name == this.editor.boneSelected 
        };
        let children = [];
        
        const addChildren = (bone, array) => {
            
            for( let b of bone.children ) {
                
                if ( ! b.isBone ){ continue; }
                let child = {
                    id: b.name,
                    children: [],
                    closed: true,
                    // selected: b.name == this.editor.boneSelected
                }
                
                array.push( child );
                
                addChildren(b, child.children);
            }
        };
        
        addChildren(rootBone, children);
        
        mytree['children'] = children;
        return mytree;
    }

    createBonePanel(root, options = {}) {

        let bonePanel = new LX.Panel({id:"bone"});
        root.attach(bonePanel);
        // Editor widgets 
        this.bonePanel = bonePanel;
        options.itemSelected = options.itemSelected ?? this.editor.selectedBone;
        this.updateSkeletonPanel();

        }

    updateSkeletonPanel() {

        if ( !this.bonePanel ){ 
            return;
        }

        let widgets = this.bonePanel;

        widgets.onRefresh = () => {
            widgets.clear();

            const boneSelected = this.editor.currentCharacter.skeletonHelper.bones[this.editor.gizmo.selectedBone];

            if(boneSelected) {

                const numTracks = this.keyFramesTimeline.getNumTracks(boneSelected);
                
                let trackType = this.editor.getGizmoMode();
                let tracks = null;
                if(this.keyFramesTimeline.selectedItems.length) {
                    tracks = this.keyFramesTimeline.animationClip.tracksPerItem[this.keyFramesTimeline.selectedItems[0]];
                }

                let active = this.editor.getGizmoMode();

                const toolsValues = [ {value:"Joint", callback: (v,e) => {this.editor.setGizmoTool(v); widgets.onRefresh();} }, {value:"Follow", callback: (v,e) => {this.editor.setGizmoTool(v); widgets.onRefresh();} }] ;
                const _Tools = this.editor.hasGizmoSelectedBoneIk() ? toolsValues : [toolsValues[0]];
                
                widgets.branch("Gizmo", { icon:"Axis3DArrows", settings: (e) => this.openSettings( 'gizmo' ) });
                
                widgets.addComboButtons( "Tool", _Tools, {selected: this.editor.getGizmoTool()});
                
                if( this.editor.getGizmoTool() == "Joint" ){
                    
                    let _Modes = [];
                    
                    for(let i = 0; i < tracks.length; i++) {
                        if(this.keyFramesTimeline.lastKeyFramesSelected.length && this.keyFramesTimeline.lastKeyFramesSelected[0][1] == tracks[i].idx) {
                            trackType = tracks[i].type;                            
                        }

                        if(tracks[i].type == "position") {
                            const mode = {
                                value: "Translate", 
                                callback: (v,e) => {
                                
                                    const frame = this.keyFramesTimeline.getCurrentKeyFrame(tracks[i], this.keyFramesTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.keyFramesTimeline.selectKeyFrame(tracks[i], frame);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }
                        else if(tracks[i].type == "quaternion" ){ 
                            const mode = {
                                value: "Rotate", 
                                callback: (v,e) => {
                                
                                    const frame = this.keyFramesTimeline.getCurrentKeyFrame(tracks[i], this.keyFramesTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.keyFramesTimeline.selectKeyFrame(tracks[i], frame);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }
                        else if(tracks[i].type == "scale") {
                            const mode = {
                                value: "Scale", 
                                callback: (v,e) => {
                                
                                    const frame = this.keyFramesTimeline.getCurrentKeyFrame(tracks[i], this.keyFramesTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.keyFramesTimeline.selectKeyFrame(tracks[i], frame);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }                        
                    }

                    if(trackType == "position") {
                        this.editor.setGizmoMode("Translate");
                    }
                    else if(trackType == "quaternion" || numTracks <= 1 ){ 
                        this.editor.setGizmoMode("Rotate"); 
                    }
                    else if(trackType == "scale") {
                        this.editor.setGizmoMode("Scale");
                    }
                    widgets.addComboButtons( "Mode", _Modes, { selected: this.editor.getGizmoMode()});

                    const _Spaces = [{value: "Local", callback: (v,e) =>  this.editor.setGizmoSpace(v)}, {value: "World", callback: (v,e) =>  this.editor.setGizmoSpace(v)}]
                    widgets.addComboButtons( "Space", _Spaces, { selected: this.editor.getGizmoSpace()});
                }

                if ( this.editor.getGizmoTool() == "Follow" ){
                     // if inhere, it means it has at least one ik mode available
                    let modesValues = [];
                    let current = this.editor.getGizmoIkMode();
                    if ( this.editor.hasGizmoSelectedBoneIk( Gizmo.ToolIkModes.LARGECHAIN ) ){
                        modesValues.push( {value:"Multiple", callback: (v,e) => {this.editor.setGizmoIkMode(v); widgets.onRefresh();} } );
                    } else { // default
                        current = "Single";
                    }

                    if ( this.editor.hasGizmoSelectedBoneIk( Gizmo.ToolIkModes.ONEBONE ) ){
                        modesValues.push( {value:"Single", callback: (v,e) => {this.editor.setGizmoIkMode(v); widgets.onRefresh();} } );
                    }

                    widgets.addComboButtons( "Mode", modesValues, {selected: current});
                    this.editor.setGizmoIkMode( current );
                }
                
                widgets.addCheckbox( "Snap", this.editor.isGizmoSnapActive(), () => this.editor.toggleGizmoSnap() );

                widgets.addSeparator();
                

                const innerUpdate = (attribute, value) => {
            
                    if(attribute == 'quaternion') {
                        boneSelected.quaternion.fromArray( value ).normalize(); 
                        // widgets.widgets['Quaternion'].set(quat.toArray(), true);

                        let rot = boneSelected.rotation.toArray();
                        rot[0] * UTILS.rad2deg; rot[1] * UTILS.rad2deg; rot[2] * UTILS.rad2deg;
                        widgets.widgets['Rotation (XYZ)'].set( rot, true ); // skip onchange event
                    }
                    else if(attribute == 'rotation') {
                        boneSelected.rotation.set( value[0] * UTILS.deg2rad, value[1] * UTILS.deg2rad, value[2] * UTILS.deg2rad ); 
                        widgets.widgets['Quaternion'].set(boneSelected.quaternion.toArray(), true ); // skip onchange event
                    }
                    else if(attribute == 'position') {
                        boneSelected.position.fromArray( value ); 

                    }

                    this.editor.gizmo.onGUI(attribute);
                };


                widgets.branch("Bone", { icon: "Bone@solid" });
                widgets.addText("Name", boneSelected.name, null, {disabled: true});
                widgets.addText("Num tracks", numTracks ?? 0, null, {disabled: true});

                // Only edit position for root bone
                if(boneSelected.children.length && boneSelected.parent.constructor !== boneSelected.children[0].constructor) {
                    this.boneProperties['position'] = boneSelected.position;
                    widgets.addVector3('Position', boneSelected.position.toArray(), (v) => innerUpdate("position", v), {disabled: this.editor.state || active != 'Translate', precision: 3, className: 'bone-position'});

                    this.boneProperties['scale'] = boneSelected.scale;
                    widgets.addVector3('Scale', boneSelected.scale.toArray(), (v) => innerUpdate("scale", v), {disabled: this.editor.state || active != 'Scale', precision: 3, className: 'bone-scale'});
                }

                this.boneProperties['rotation'] = boneSelected.rotation;
                let rot = boneSelected.rotation.toArray();
                rot[0] * UTILS.rad2deg; rot[1] * UTILS.rad2deg; rot[2] * UTILS.rad2deg;
                widgets.addVector3('Rotation (XYZ)', rot, (v) => {innerUpdate("rotation", v)}, {step:1, disabled: this.editor.state || active != 'Rotate', precision: 3, className: 'bone-euler'});

                this.boneProperties['quaternion'] = boneSelected.quaternion;
                widgets.addVector4('Quaternion', boneSelected.quaternion.toArray(), (v) => {innerUpdate("quaternion", v)}, {step:0.01, disabled: true, precision: 3, className: 'bone-quaternion'});
            }

        };

        widgets.onRefresh();
    }
    /** ------------------------------------------------------------ */

    loadKeyframeClip( clip, callback ) {

        this.hideCaptureArea();
        
        this.clip = clip || { duration: 1};
        this.duration =  this.clip.duration;

        let boneName = null;
        if(this.editor.currentCharacter.skeletonHelper.bones.length) {
            boneName = this.editor.currentCharacter.skeletonHelper.bones[0].name;
        }

        let tracks = [];
        for(let i = 0; i < this.clip.tracks.length; i++) {
            if(this.clip.tracks[i].name.includes("position") && i > 0)
                continue;
            tracks.push(this.clip.tracks[i]);
        }
        this.clip.tracks = tracks;

        this.keyFramesTimeline.setAnimationClip(this.clip);
        this.keyFramesTimeline.setSelectedItems([boneName]);

        if(callback)
            callback();
    }

    createSaveDialog() {
        this.showExportAnimationsDialog( "Save animations in server", ( info ) => {

            const saveDataToServer = (location,) => {
                const animations = this.editor.export(this.editor.getAnimationsToExport(), info.format, false);
                for( let i = 0; i < animations.length; i++ ) {
                    
                    this.editor.uploadData( animations[i].name, animations[i].data, "clips", location, () => {
                        this.closeDialogs();
                        LX.popup('"' + animations[i].name + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                    })
                }
            }

            const session = this.editor.remoteFileSystem.session;
            const user = session ? session.user : "";
            
            if(!user || user.username == "guest") {
                this.prompt = new LX.Dialog("Alert", d => {
                    d.addTextArea(null, "The animation will be saved locally. You must be logged in to save it into server.", null, {disabled:true, className: "nobg"});
                    const btn = d.addButton(null, "Login", () => {
                        this.prompt.close();
                        this.showLoginModal();
                    }, {width:"50%", buttonClass:"accent"});
                    btn.root.style.margin = "0 auto";
                }, {closable: true, modal: true})
                
            }
            else {
                saveDataToServer("server");
            }
        }, {formats: [ "BVH", "BVH extended"], selectedFormat: "BVH extended"});
    }

    createServerClipsDialog() {
        
        const session = this.editor.remoteFileSystem.session;
        const username = session ? session.user.username : "guest";
        let repository = this.editor.remoteFileSystem.repository;

        if( this.prompt && this.prompt.root.checkVisibility() ) {
            return;
        }
        
        // Create a new dialog
        const dialog = this.prompt = new LX.Dialog('Available clips', async (p) => {
            
            const innerSelect = async (asset, button, e, action) => {                
                const choice = document.getElementById("choice-insert-mode");
                if( choice ) {
                    choice.remove();
                }
                
                if( !asset.animation ) {
                    dialog.close();
                    this.closeDialogs();
                    LX.popup("The file is empty or has an incorrect format.", "Ops! Animation Load Issue!", {timeout: 9000, position: [ "10px", "50px"] });

                    return;
                }

                switch(button) {
                    case "Add as single clip":
                        this.mode = ClipModes.Phrase;
                        break;
                    case "Breakdown into keyframes":
                        this.mode = ClipModes.Keyframes;
                        break;                   
                }
                this.keyFramesTimeline.onUnselectKeyFrames();
                asset.animation.name = asset.id;

                dialog.panel.loadingArea.show();
                this.editor.loadAnimation( asset.id, asset.animation );
                dialog.panel.loadingArea.hide();
    
                assetViewer.clear();
                dialog.close();
            }

            const previewActions = [
                {
                    type: "bvh",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bvh",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "bvh",
                    name: 'Breakdown into keyframes', 
                    callback: innerSelect
                },
                {
                    type: "bvhe",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bvhe",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "bvhe",
                    name: 'Breakdown into keyframes', 
                    callback: innerSelect
                },                
            ];

            if( username != "guest" ) {
                previewActions.push(
                {
                    type: "bvh",
                    path: "@/Local/clips",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.uploadData(item.filename, item.data, "clips", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/Local/clips",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.uploadData(item.filename, item.data, "clips", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvh",
                    path: "@/Local/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        const i = this.editor.localStorage[0].children[0].children.indexOf(item);
                        const items = this.editor.localStorage[0].children[0].children;
                        this.editor.localStorage[0].children[0].children = items.slice(0, i).concat(items.slice(i+1));  
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/Local/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        const i = this.editor.localStorage[0].children[0].children.indexOf(item);
                        const items = this.editor.localStorage[0].children[0].children;
                        this.editor.localStorage[0].children[0].children = items.slice(0, i).concat(items.slice(i+1));                        
                    }
                });             
                previewActions.push({
                    type: "bvh",
                    path: "@/"+ username + "/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                            if(v) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                item.folder.children = v;
                                assetViewer._deleteItem(item);
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            // this.closeDialogs();                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/"+ username + "/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                            if(v) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                item.folder.children = v;
                                assetViewer._deleteItem(item);
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            // this.closeDialogs();                            
                        });
                    }
                });            
            }
            
            const assetViewer = new LX.AssetView({  allowedTypes: ["bvh", "bvhe", "glb", "gltf"],  previewActions: previewActions, contextMenu: false});
            p.attach( assetViewer );
            
            const loadingArea = p.loadingArea = this.createLoadingArea(p);

            if( !repository.length ) {
                await this.editor.remoteFileSystem.loadAllUnitsFolders(() => {
                    let repository = this.editor.remoteFileSystem.repository;
                    this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                    loadingArea.hide();
                }, ["clips"]);
            }            
            else {
                this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                loadingArea.hide();
            }
       
        }, { title:'Clips', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: false,  modal: true,
    
            onclose: ( root ) => {

                if( modal.destroy ) {
                    modal.destroy();
                }
                root.remove();

                this.prompt = null;
                if( !LX.modal.hidden ) {
                    LX.modal.toggle(true);
                }
                if( this.choice ) {
                    this.choice.close();
                }
            }
        });
    }

    loadAssets( assetViewer, repository, onSelectFile ) {
        assetViewer.load( repository, async e => {
            switch(e.type) {
                case LX.AssetViewEvent.ASSET_SELECTED:
                    if(e.item.type == "folder") {
                        return;
                    }                      
                    if(!e.item.animation) {
                        const promise = new Promise((resolve) => {
                            this.editor.fileToAnimation(e.item, ( file ) => {
                                if( file ) {
                                    resolve(file);
                                }
                                else {
                                    resolve( null );
                                }
                            });
                        })
                        const parsedFile = await promise;
                        e.item.animation = parsedFile.animation;
                        e.item.content = parsedFile.content;
                    }
                    break;
                case LX.AssetViewEvent.ASSET_DELETED: 
                    console.log(e.item.id + " deleted"); 
                    break;
                case LX.AssetViewEvent.ASSET_CLONED: 
                    console.log(e.item.id + " cloned"); 
                    break;
                case LX.AssetViewEvent.ASSET_RENAMED:
                    console.log(e.item.id + " is now called " + e.value); 
                    break;
                case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                    if(e.item.type != "folder") {
                        const dialog = new LX.Dialog("Add clip", async ( panel ) => {
                            if( !e.item.animation ) {
                                const promise = new Promise((resolve) => {
                                    this.editor.fileToAnimation(e.item, (file) => {
                                        if( file ) {
                                            resolve(file);
                                        }
                                        else {
                                            resolve( null );
                                        }
                                    });
                                })
                                const parsedFile = await promise;
                                e.item.animation = parsedFile.animation;
                                e.item.content = parsedFile.content;
                            }

                            panel.addTextArea(null, "How do you want to insert the clip?", null, {disabled:true,  className: "nobg"});
                            panel.sameLine(2);
                            panel.addButton(null, "Add as single clip", (v) => { 
                                dialog.close();
                                this.mode = ClipModes.Phrase;
                                this.closeDialogs(); 
                                onSelectFile(e.item, v);
                            });
                            panel.addButton(null, "Breakdown into keyframes", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Keyframes;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            });
                        }, { modal: true, closable: true, id: "choice-insert-mode"})
                    }
                    break;

                case LX.AssetViewEvent.ENTER_FOLDER:
                    if( e.item.unit && !e.item.children.length ) {
                        assetViewer.parent.loadingArea.show();

                        this.editor.remoteFileSystem.getFiles(e.item.unit, e.item.fullpath, (files, resp) => {
                            const files_data = [];
                            if( files ) {                                        
                                for( let f = 0; f < files.length; f++ ) {
                                    files[f].id = files[f].filename;
                                    files[f].folder = e.item;
                                    files[f].type = UTILS.getExtension(files[f].filename);
                                    files[f].lastModified = files[f].timestamp;
                                    if(files[f].type == "txt")
                                        continue;
                                    files_data.push(files[f]);
                                }
                                e.item.children = files_data;
                            }
                            assetViewer.currentData = files_data;
                            assetViewer._updatePath(assetViewer.currentData);

                            if( !assetViewer.skipBrowser ) {
                                assetViewer._createTreePanel();
                            }

                            assetViewer._refreshContent();

                            assetViewer.parent.loadingArea.hide();
                        });
                    }                
                    break;
            }
        })
    }

    showSourceCode( asset ) {
        if( window.dialog ) {
            window.dialog.destroy();
        }
    
        window.dialog = new LX.PocketDialog("Editor", p => {
            const area = new LX.Area();
            p.attach( area );

            const filename = asset.filename;
            const type = asset.type;
            const name = filename.replace("."+ type, "");
                        
            const codeEditor = new LX.CodeEditor(area, {
                allow_add_scripts: false,
                name: type,
                title: name,
                disable_edition: true
            });
            
            codeEditor.setText( asset.content );
            
            codeEditor._changeLanguage( "JSON" );
                     
        }, { size: ["40%", "600px"], closable: true });
    }
}

const ClipModes = { Phrase: 0, Glosses: 1, Actions: 2, Keyframes: 3};
class ScriptGui extends Gui {

    constructor(editor) {
        
        super(editor);
        
        this.mode = ClipModes.Actions;
        this.delayedUpdateID = null; // onMoveContent and onUpdateTracks. Avoid updating after every single change, which makes the app unresponsive
        this.delayedUpdateTime = 500; //ms

        this.animationPanel = new LX.Panel({id:"animation"});
    }

    onCreateMenuBar( menubar ) {
        
        // Export (download) animation
        menubar.add("Project/Export animations", {short: "CTRL+E", icon: "Download", callback: () => {            
            this.showExportAnimationsDialog("Export animations", ( info ) => this.editor.export( this.editor.getAnimationsToExport(), info.format ), {formats: ["BML", "BVH", "BVH extended", "GLB"]});
        }});

        // Save animation in server
        menubar.add("Project/Save animation", {short: "CTRL+S", callback: () => this.createSaveDialog(), icon: "Save"});

        menubar.add("Project/Preview in PERFORMS", {icon: "StreetView",  callback: () => this.editor.showPreview() });
        
        menubar.add("Timeline/Shortcuts/Move clips", { short: "Hold CTRL" });
        menubar.add("Timeline/Shortcuts/Add clips", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Add behaviour", { short: "CTRL+B" });
        menubar.add("Timeline/Shortcuts/Copy clips", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Copy clips", { short: "CTRL+C" });
        menubar.add("Timeline/Shortcuts/Paste clips", { short: "Right Click" });
        menubar.add("Timeline/Shortcuts/Paste clips", { short: "CTRL+V" });
        menubar.add("Timeline/Shortcuts/Delete clips");
        menubar.add("Timeline/Shortcuts/Delete clips/Single", { short: "DEL" });
        menubar.add("Timeline/Shortcuts/Delete clips/Multiple", { short: "Hold LSHIFT + DEL" });
        menubar.add("Timeline/Shortcuts/Clip selection");
        menubar.add("Timeline/Shortcuts/Clip selection/Single", { short: "Left Click" });
        menubar.add("Timeline/Shortcuts/Clip selection/Multiple", { short: "Hold LSHIFT" });
        menubar.add("Timeline/Shortcuts/Clip selection/Box", { short: "Hold LSHIFT+Drag" });
       
        menubar.add("Help/Tutorial", {callback: () => window.open("docs/script_animation.html", "_blank")});
        menubar.add("Help/BML Instructions", {callback: () => window.open("https://github.com/upf-gti/performs/blob/main/docs/InstructionsBML.md", "_blank")});   
    }

    delayedUpdateTracks( reset = true ){
        if ( this.delayedUpdateID && reset ){ clearTimeout(this.delayedUpdateID); this.delayedUpdateID = null; }
        if ( !this.delayedUpdateID ){
            this.delayedUpdateID = setTimeout( ()=>{ this.delayedUpdateID = null; this.editor.updateTracks(); }, this.delayedUpdateTime );
        }
    }

    /** Create timelines */
    createTimelines( ) {
                               
        this.clipsTimeline = new LX.ClipsTimeline("Behaviour actions", {
           // trackHeight: 30,
            onCreateSettingsButtons: (panel) => {
                panel.addButton("", "clearTracks", (value, event) =>  {
                    this.editor.clearAllTracks();     
                    this.updateAnimationPanel();
                }, {icon: 'Trash2', width: "40px"});
                
            },
            onChangeLoopMode: (loop) => {
                this.updateLoopModeGui( loop );
            },
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Framerate", this.editor.animationFrameRate, (v) => {
                    this.editor.animationFrameRate = v;
                }, {min: 0, disabled: false});
                dialog.addNumber("Num tracks", this.clipsTimeline.animationClip ? this.clipsTimeline.animationClip.tracks.length : 0, null, {disabled: true});
            },
        });
        this.clipsTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.clipsTimeline.onSetSpeed = (v) => this.editor.setPlaybackRate(v);
        this.clipsTimeline.onSetTime = (t) => this.editor.setTime(t, true);
        this.clipsTimeline.onSetDuration = (t) => { 
            let currentBinded = this.editor.getCurrentBindedAnimation();
            if (!currentBinded){ return; }
            currentBinded.mixerAnimation.duration = t;
        };
       
        this.clipsTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").children[0].children[0].click();
            }
        }
        this.clipsTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").children[0].children[0].click();
        }
        this.clipsTimeline.onSelectClip = this.updateClipPanel.bind(this);

        this.clipsTimeline.onContentMoved = (clip, offset)=> {
            if(clip.strokeStart) clip.strokeStart+=offset;
            if(clip.stroke) clip.stroke+=offset;
            if(clip.strokeEnd) clip.strokeEnd+=offset;
            this.updateClipSyncGUI();
            if(clip.onChangeStart)  {
                clip.onChangeStart(offset);
            }

            this.delayedUpdateTracks();
        };

        this.clipsTimeline.deleteSelectedContent = () => {
            this.clipsTimeline.deleteClip(null); // delete selected clips
            this.editor.updateTracks();
            this.updateClipPanel();
        }

        this.clipsTimeline.cloneClips = (clipsToClone, timeOffset) => {
            let clipsToReturn = [];
            for(let i = 0; i < clipsToClone.length; i++){
                let clip = clipsToClone[i];
                clip.end = null;
                if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                if(clip.ready!=undefined) clip.ready = clip.fadein;
                if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                if(clip.relax!=undefined) clip.relax = clip.fadeout;
                if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                
                let newClip = new ANIM[clip.constructor.name](clip);
                newClip.start += timeOffset;
                newClip.fadein += timeOffset; 
                newClip.fadeout += timeOffset; 
                if(newClip.attackPeak) newClip.fadein = newClip.attackPeak += timeOffset;
                if(newClip.relax) newClip.fadeout = newClip.relax += timeOffset;
                if(newClip.ready) newClip.fadein = newClip.ready += timeOffset;
                if(newClip.strokeStart) newClip.strokeStart += timeOffset;
                if(newClip.stroke) newClip.stroke += timeOffset;
                if(newClip.strokeEnd) newClip.strokeEnd += timeOffset;
                
                clipsToReturn.push(newClip); 
            }
            return clipsToReturn;
        }

        this.clipsTimeline.showContextMenu = ( e ) => {

            e.preventDefault();
            e.stopPropagation();

            let actions = [];
            //let track = this.NMFtimeline.clip.tracks[0];
            if(this.clipsTimeline.lastClipsSelected.length) {
                actions.push(
                    {
                        title: "Copy",
                        callback: () => this.clipsTimeline.copySelectedContent()
                    }
                )
                actions.push(
                    {
                        title: "Delete",
                        callback: () => this.clipsTimeline.deleteSelectedContent()
                    }
                )
                actions.push(
                    {
                        title: "Create preset",
                        callback: () => {
                            this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                                if(a[0]<b[0]) 
                                    return -1;
                                return 1;
                            });
                            this.createSaveDialog( "presets");
                            // this.createNewPresetDialog(this.clipsTimeline.lastClipsSelected);
                        }
                    }
                )
                if(this.clipsTimeline.lastClipsSelected.length == 1 && e.track.idx == this.clipsTimeline.lastClipsSelected[0][0]) {
                    let clip = e.track.clips[this.clipsTimeline.lastClipsSelected[0][1]];
                    if(clip.type == "glossa") {                        
                        actions.push(
                            {
                                title: "Break down into actions",
                                callback: () => {
                                    this.clipsTimeline.deleteSelectedContent();
                                    this.mode = ClipModes.Actions;
                                    this.clipsTimeline.addClips(clip.clips, this.clipsTimeline.currentTime);
                                }
                            }
                        )
                    }
                }
                // actions.push(
                //     {
                //         title: "Create sign/Local",
                //         callback: () => {
                //             this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                //                 if(a[0]<b[0]) 
                //                     return -1;
                //                 return 1;
                //             });
                //             this.createNewSignDialog(this.clipsTimeline.lastClipsSelected, "local");
                //         }
                //     }
                // )

                actions.push(
                    {
                        title: "Create sign",
                        callback: () => {
                            
                                this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                                    if(a[0]<b[0]) 
                                        return -1;
                                    return 1;
                                });
                                this.createSaveDialog();
                                // this.createNewSignDialog(this.clipsTimeline.lastClipsSelected, "server");                            
                        }
                    }
                )
            }
            else{
                actions.push(
                    {
                        title: "Add behaviour",
                        callback: this.createClipsDialog.bind(this)
                    },                    
                    {
                        title: "Add animation",
                        callback: this.createServerClipsDialog.bind(this)
                    }
                );
                
                if(this.clipsTimeline.clipboard)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => this.clipsTimeline.pasteContent()
                        }
                    )
                }
            }
            
            LX.addContextMenu("Options", e, (m) => {
                for(let i = 0; i < actions.length; i++) {
                    m.add(actions[i].title,  actions[i].callback )
                }
            });

        }

        this.clipsTimeline.onUpdateTrack = this.delayedUpdateTracks.bind(this); 
        this.clipsTimeline.onChangeTrackVisibility = (track, oldState) => { this.editor.updateTracks(); }
        this.timelineArea.attach(this.clipsTimeline.mainArea);
        this.clipsTimeline.canvas.tabIndex = 1;

        this.editor.activeTimeline = this.clipsTimeline;
    }
    
    dataToBMLClips(data, mode) {
        //assuming data.behaviours starts at 0, like it is in "local time"

        let clips = [];
        let globalStart = 9999999;
        let globalEnd = -9999999;
        let glossStart = 9999999;
        let glossClips = [];
        let gloss = "";
        let unnamedGlosses = 0;

        if(data && data.behaviours) {
            for(let i = 0; i < data.behaviours.length; i++) {
                let clipClass = null;
                if(!data.indices){
                    switch(data.behaviours[i].type) {
                        case "gaze":
                            clipClass = ANIM.GazeClip;
                            break;
                        case "gazeShift":
                            clipClass = ANIM.GazeClip;
                            break;
                        case "head":
                            clipClass = ANIM.HeadClip;
                            break;
                        case "headDirectionShift":
                            clipClass = ANIM.HeadClip;
                            break;
                        case "face":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "faceLexeme":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "faceFACS":
                            clipClass = ANIM.FaceFACSClip;
                            break;
                        case "faceEmotion":
                            clipClass = ANIM.FaceEmotionClip;
                            break;
                        case "faceVA":
                            break;
                        case "faceShift":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "speech":
                            clipClass = ANIM.MouthingClip;
                            break;
                        case "gesture":
                        {
                            if(data.behaviours[i].handConstellation)
                                clipClass = ANIM.HandConstellationClip;
                            else if(data.behaviours[i].bodyMovement)
                                clipClass = ANIM.BodyMovementClip;
                            else if(data.behaviours[i].elbowRaise)
                                clipClass = ANIM.ElbowRaiseClip;
                            else if(data.behaviours[i].shoulderRaise || data.behaviours[i].shoulderHunch)
                                clipClass = ANIM.ShoulderClip;
                            else if(data.behaviours[i].locationBodyArm)
                                clipClass = ANIM.ArmLocationClip;
                            else if(data.behaviours[i].palmor)
                                clipClass = ANIM.PalmOrientationClip;
                            else if(data.behaviours[i].extfidir)
                                clipClass = ANIM.HandOrientationClip;
                            else if(data.behaviours[i].handshape)
                                clipClass = ANIM.HandshapeClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "directed")
                                clipClass = ANIM.DirectedMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "circular")
                                clipClass = ANIM.CircularMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "wrist")
                                clipClass = ANIM.WristMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "fingerplay")
                                clipClass = ANIM.FingerplayMotionClip;
                            break;
                        }                       
                    }
                }
                else {
                    clipClass = ANIM.clipTypes[data.indices[i]];
                }

                if(clipClass){
                    glossStart = Math.min(glossStart, data.behaviours[i].start >= 0 ? data.behaviours[i].start : glossStart);
                    globalStart = Math.min(globalStart, data.behaviours[i].start >= 0 ? data.behaviours[i].start : globalStart);
                    globalEnd = Math.max(globalEnd, data.behaviours[i].end || globalEnd);
                                  
                    clips.push(new clipClass( data.behaviours[i]));        
                    
                }

                if(mode == ClipModes.Glosses) {

                    // save previous gloss clips before changing to new one (or end of behaviours)
                    if((data.behaviours[i].gloss || i == data.behaviours.length - 1)) {
                        if ( clips.length ){
                            if ( !gloss || !gloss.length){
                                gloss = "UNNAMED_" + (unnamedGlosses++).toString(); 
                            }
                            let duration = globalEnd - glossStart;
                            glossClips.push(new ANIM.SuperClip( {start: glossStart, duration: (duration > 0) ? duration : 0, type: "glossa", id: gloss, clips, clipTimeMode: ANIM.SuperClip.clipTimeModes.GLOBAL}));
                        }
                        clips = [];
                        glossStart = 9999999;
                        gloss = data.behaviours[i].gloss;                    
                    }
                }        
            }
        }

        clips = glossClips.length ? glossClips : clips;
        let duration = Math.max( 0, globalEnd - globalStart );
        if (mode == ClipModes.Phrase){
            clips = [ new ANIM.SuperClip( {duration: duration, type: "glossa", id: data.name ?? "UNNAMED", clips, clipTimeMode: ANIM.SuperClip.clipTimeModes.GLOBAL} ) ]; 
        }
        return {clips: clips, duration: duration};
    }

    loadBMLClip(clip) {         
        let {clips, duration} = this.dataToBMLClips(clip, this.mode);

        this.clipsTimeline.addClips(clips, this.clipsTimeline.currentTime);
    
        this.clip = this.clipsTimeline.animationClip || clip ;
        this.duration = this.clip.duration || duration;
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {

        const area = new LX.Area({className: "sidePanel", id: 'panel', scroll: true});  
        this.sidePanel.attach(area);

        const [top, bottom] = area.split({type: "vertical", resize: false, sizes: "auto"});
        
        top.attach(this.animationPanel);
        this.clipPanel = new LX.Panel({id:"bml-clip"});
        bottom.attach(this.clipPanel);

        this.updateAnimationPanel( );
        this.updateClipPanel( );
    }

    updateAnimationPanel( options = {}) {
        let widgets = this.animationPanel;

        widgets.onRefresh = (o) => {

            o = o || {};
            widgets.clear();
            widgets.addTitle("Animation");

            const animation = this.editor.getCurrentAnimation() ?? {}; // loadedAnimations[current]
            let saveName = animation ? animation.saveName : "";
            widgets.addText("Name", saveName || "", (v) =>{ 
                animation.saveName = v; 
            } )
            
            widgets.addSeparator();
            widgets.addComboButtons("Dominant hand", [{value: "Left", callback: (v) => this.editor.dominantHand = v}, {value:"Right", callback: (v) => this.editor.dominantHand = v}], {selected: this.editor.dominantHand})
            widgets.addButton(null, "Add behaviour", () => this.createClipsDialog(), {title: "CTRL+K"} )
            widgets.addButton(null, "Add animation", () => this.createServerClipsDialog(), {title: "CTRL+L"} )
            widgets.addSeparator();
        }
        widgets.onRefresh(options);
    }

    updateClipSyncGUI(checkCurve = true){
                
        // TODO
        // clip.fadein and clip.attackPeak && clip.ready hold the same value, a time in worldcoordinates. However, after creating a clip and placing it
        // in the timeline, the .start, .fadein .fadeout automatically changes to the currenttime (timeline) but the attackpeak, ready, relax do not.
        // This is a BUG that it is being ignored. The toJson fn from each clip already handles this. But it is still a bug.

        if ( this.clipsTimeline.lastClipsSelected.length != 1 ){ 
            return; 
        }

        const widgets = this.clipPanel;
        const clip = this.clipsTimeline.animationClip.tracks[this.clipsTimeline.lastClipsSelected[0][0]].clips[this.clipsTimeline.lastClipsSelected[0][1]];
        let w = null;

        w = widgets.get("Start");
        if ( w ) { 
            w.set(clip.start, true);
        }
        w = widgets.get("Duration");
        if ( w ) { 
            w.set(clip.duration, true);
        }


        if( clip.fadein != undefined ) { 
            clip.fadein = Math.clamp(clip.fadein, clip.start, clip.start + clip.duration); 
            w = widgets.get("Attack Peak (s)");
            if ( w ) { 
                clip.attackPeak = clip.fadein;
                w.setLimits(0, clip.fadeout - clip.start, 0.001);
                w.set(clip.fadein - clip.start, true);
            }
            w = widgets.get("Ready (s)");
            if ( w ) { 
                clip.ready = clip.fadein;
                w.setLimits(0, clip.fadeout - clip.start, 0.001);
                w.set(clip.fadein - clip.start, true);
            }
        }


        if( clip.fadeout != undefined ) { 
            clip.fadeout = Math.clamp(clip.fadeout, clip.fadein, clip.start + clip.duration); 
            w = widgets.get("Relax (s)");
            if ( w ) { 
                clip.relax = clip.fadeout;
                w.setLimits( clip.fadein - clip.start, clip.duration, 0.001);
                w.set(clip.fadeout - clip.start, true);
            }
        }

        if( clip.strokeStart != undefined ) { 
            clip.strokeStart = Math.clamp(clip.strokeStart, clip.fadein, clip.fadeout); 
            w = widgets.get("Stroke start (s)");
            if ( w ) { 
                w.setLimits( clip.fadein - clip.start, clip.fadeout - clip.start, 0.001);
                w.set(clip.strokeStart - clip.start, true);
            }
        }
        if( clip.strokeEnd != undefined ) { 
            clip.strokeEnd = Math.clamp(clip.strokeEnd, clip.strokeStart ?? clip.fadein, clip.fadeout); 
            w = widgets.get("Stroke end (s)");
            if ( w ) { 
                w.setLimits( (clip.strokeStart ?? clip.fadein) - clip.start, clip.fadeout-clip.start, 0.001);
                w.set(clip.strokeEnd - clip.start, true);
            }
        }
        if( clip.stroke != undefined ) { 
            clip.stroke = Math.clamp(clip.stroke, clip.strokeStart ?? clip.fadein, clip.strokeEnd ?? clip.fadeout); 
            w = widgets.get("Stroke (s)");
            if ( w ) { 
                w.setLimits( (clip.strokeStart ?? clip.fadein) - clip.start, (clip.strokeEnd ?? clip.fadeout) - clip.start, 0.001);
                w.set(clip.stroke - clip.start, true);
            }
        }

        if ( checkCurve ) {
            w = widgets.get("Synchronization");
            if ( w ) {
                w.set([[(clip.fadein-clip.start)/clip.duration,0.5],[(clip.fadeout-clip.start)/clip.duration,0.5]], true);
            }
        }
        
    }

    /** Non -manual features based on BML */
    updateClipPanel(clip) {
        
        let widgets = this.clipPanel;
        if(this.clipsTimeline.lastClipsSelected.length > 1) {
            clip = null;
        }

        widgets.onRefresh = (clip) => {

            widgets.clear();
            if(!clip) {
                if(this.clipsTimeline.lastClipsSelected.length > 1) {
                    widgets.addButton(null, "Create preset", (v, e) => this.createSaveDialog( "presets" ))//this.createNewPresetDialog());
                }
                return;
            }
            
            this.clipInPanel = clip;
            const updateTracks = () => {
                if(!clip)
                    return;

                if(clip && clip.start + clip.duration > this.clipsTimeline.duration) {
                    this.clipsTimeline.setDuration(clip.start + clip.duration);
                }
                this.delayedUpdateTracks();
                this.editor.setTime(this.clipsTimeline.currentTime);
            }

            widgets.widgets_per_row = 1;
            // this.clipPanel.branch(clip.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g).join(" "));

            let icon = "ChildReaching";

            if(clip.constructor.name.includes("Face")) 
                icon = "Smile"
            else if(clip.constructor.name.includes("Mouthing")) 
                icon = "MessageCircleMore";
            else if(clip.constructor.name.includes("Head"))
                icon = "User";
            else if(clip.constructor.name.includes("Gaze"))
                icon = "Eye";
            else if(clip.constructor.name.includes("Super")) 
                icon = "ClapperboardClosed";

            let clipName = clip.constructor.name.includes("Super") ? "Glossa Clip" : clip.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g).join(" ");
            widgets.addTitle(clipName, {icon} );
            widgets.addText("Id", clip.id, (v) => this.clipInPanel.id = v)
            
            widgets.branch("Content");
            if(clip.showInfo)
            {
                clip.showInfo(widgets, updateTracks);
            }
            else{
                for(var i in clip.properties)
                {
                    var property = clip.properties[i];
                    switch(property.constructor)
                    {
                        
                        case String:
                            widgets.addText(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                            });
                            break;
                        case Number:
                            if(i=="amount")
                            {
                                widgets.addNumber(i, property, (v,e,n) => 
                                {
                                    this.clipInPanel.properties[n] = v;
                                    updateTracks();
                                }, {min:0, max:1, step:0.01, precision: 2});
                            }
                            else{
                                widgets.addNumber(i, property, (v, e, n) =>
                                {
                                    this.clipInPanel.properties[n] = v;
                                    updateTracks();
                                }, {precision: 2});
                            }
                            break;
                        case Boolean:
                            widgets.addCheckbox(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                                updateTracks();
                            });
                            break;
                        case Array:
                            widgets.addArray(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                                updateTracks();
                            });
                            break;
                    }
                }
            }
            widgets.merge()
            widgets.branch("Time", {icon: "Clock"});
	
            widgets.addNumber("Start", clip.start.toFixed(2), (v) =>
            {     
                const selectedClip = this.clipsTimeline.lastClipsSelected[0];
                const trackIdx = selectedClip[0];
                const track = this.clipsTimeline.animationClip.tracks[trackIdx];
                const clipIdx = selectedClip[1];
                if ( clipIdx == 0){ v = Math.max( 0, v ); }
                if ( clipIdx < track.clips.length-1 ){ v = Math.min( v, track.clips[clipIdx+1].start - clip.duration - 0.00001 ); }
                let diff = v - clip.start;  
                if(clip.attackPeak != undefined)      
                    clip.attackPeak = clip.fadein += diff;
                if(clip.ready != undefined)      
                    clip.ready = clip.fadein += diff;
                if(clip.relax != undefined)
                    clip.relax = clip.fadeout += diff;
                if(clip.strokeStart != undefined) 
                    clip.strokeStart += diff;
                if(clip.stroke != undefined) 
                    clip.stroke += diff;
                if(clip.strokeEnd != undefined) 
                    clip.strokeEnd += diff;
                this.clipInPanel.start = v;
                clip.start = v;
                
                if(clip.onChangeStart) {
                    clip.onChangeStart(diff);
                }
				this.updateClipSyncGUI();
                updateTracks();
                
            }, {min:0, step:0.01, precision:2});

            widgets.addNumber("Duration", clip.duration.toFixed(2), (v) =>
            {

                const selectedClip = this.clipsTimeline.lastClipsSelected[0];
                const trackIdx = selectedClip[0];
                const track = this.clipsTimeline.animationClip.tracks[trackIdx];
                const clipIdx = selectedClip[1];
                if ( clipIdx < track.clips.length-1 ){ v = Math.min( v, track.clips[clipIdx+1].start - clip.start - 0.00001 ); }
                clip.duration = v;
                this.clipInPanel.duration = v;              
               
                this.updateClipSyncGUI();
                updateTracks();

            }, {min:0.01, step:0.001, precision:2, disabled: clip.type == "custom"});

            if(clip.fadein!= undefined && clip.fadeout!= undefined)  {
                widgets.merge();
                widgets.branch("Sync points", {icon: "SplinePointer"});
                widgets.addTextArea(null, "These sync points define the dynamic progress of the action. They are normalized by duration.", null, {disabled: true,  className: "nobg"});
                const syncvalues = [];
                
                if(clip.fadein != undefined)
                {
                    syncvalues.push([(clip.fadein - clip.start)/clip.duration, 0.5]);
                    if(clip.attackPeak != undefined)
                        // clip.attackPeak = clip.fadein = Math.clamp(clip.start, clip.relax);
                        widgets.addNumber("Attack Peak (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.attackPeak = clip.fadein = v + clip.start;
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min:0, max: clip.fadeout - clip.start, step:0.001, precision:2, title: "Maximum action achieved"});
                    
                    if(clip.ready != undefined)
                        widgets.addNumber("Ready (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.ready = clip.fadein = v + clip.start;
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min:0, max: clip.fadeout - clip.start, step:0.001, precision:2, title: "Target acquired or end of the preparation phase"});
                }

                if(clip.strokeStart != undefined) {

                    // clip.strokeStart = Math.clamp(clip.strokeStart, clip.ready, clip.stroke);
                    widgets.addNumber("Stroke start (s)", (clip.strokeStart - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeStart = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.ready - clip.start, max: clip.stroke - clip.start, step:0.001, precision:2, title: "Start of the stroke"});
                }

                if(clip.stroke != undefined) {
                    // clip.stroke = Math.clamp(clip.stroke, clip.strokeStart, clip.strokeEnd);
                    
                    widgets.addNumber("Stroke (s)", (clip.stroke - clip.start).toFixed(2), (v) =>
                    {              
                        clip.stroke = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.strokeStart - clip.start, max: clip.strokeEnd - clip.start, step:0.001, precision:2, title: "Stroke of the motion"});
                }

                if(clip.strokeEnd != undefined) {
                    // clip.strokeEnd = Math.clamp(clip.strokeEnd, clip.stroke, clip.relax); 

                    widgets.addNumber("Stroke end (s)", (clip.strokeEnd - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeEnd = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.stroke - clip.start, max: clip.relax - clip.start, step:0.001, precision:2, title: "End of the stroke"});
                }


                if(clip.fadeout != undefined) 
                {
                    syncvalues.push([(clip.fadeout - clip.start)/clip.duration, 0.5]);
                    
                    if(clip.relax != undefined)
                        // clip.relax = clip.fadeout = Math.clamp(clip.relax, clip.strokeEnd, clip.start + clip.duration); 
                        widgets.addNumber("Relax (s)", (clip.fadeout - clip.start).toFixed(2), (v) =>
                        {              
                            clip.relax = clip.fadeout = v + clip.start;
                            if(clip.attackPeak != undefined)
                                clip.attackPeak = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);

                            if(clip.ready != undefined)
                                clip.ready = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min: clip.fadein - clip.start, max: clip.duration , step:0.001, precision:2, title: "Decay or retraction phase starts"});
                }

                if(syncvalues.length) {
                   
                    this.curve = widgets.addCurve("Synchronization", syncvalues, (value, event) => {
                        // if(event && event.type != "mouseup") return;
                        if(clip.fadein!= undefined) {
                            clip.fadein = value[0][0]*clip.duration + clip.start;
                            if(clip.attackPeak != undefined)
                                clip.attackPeak = clip.fadein;
                            if(clip.ready != undefined)
                                clip.ready = clip.fadein;
                        }
                        if(clip.fadeout!= undefined) {
                            clip.relax = clip.fadeout = value[1][0]*clip.duration + clip.start;
                        }
                        this.updateClipSyncGUI(false);       
                        updateTracks();
                    }, {xrange: [0, 1], yrange: [0, 1], skipReset: true, allowAddValues: false, moveOutAction: LX.CURVE_MOVEOUT_CLAMP, draggableY: false, smooth: 0.2});
                }
                widgets.merge();
            }

            widgets.addButton(null, "Delete", (v, e) => {
                this.clipsTimeline.deleteClip(this.clipsTimeline.lastClipsSelected[this.clipsTimeline.lastClipsSelected.length - 1]);
                clip = null;  
                updateTracks(); 
                this.delayedUpdateTracks();
                this.updateClipPanel();
            });
            
        }
        widgets.onRefresh(clip);
        
    }

    showGuide() {       
        this.prompt = new LX.Dialog("How to start?", (p) =>{
            LX.makeContainer( [ "100%", "auto" ], "p-8 whitespace-pre-wrap text-lg", 
                "You can create an animation from a selected clip or from a preset configuration. You can also import animations or presets in JSON format following the BML standard. <br> <br> Go to 'Help' for more information about the application.", 
                p.root, 
                { wordBreak: "break-word", lineHeight: "1.5rem" } );
        }, {closable: true, onclose: (root) => {
            root.remove();
            this.prompt = null;
            LX.popup("Click on Timeline tab to discover all the available interactions.", "Useful info!", {position: [ "10px", "50px"], timeout: 5000})
        },
        modal: true
    })

    }

    createSaveDialog( folder ) {
        this.showExportAnimationsDialog( "Save animations in server", ( info ) => {

            const saveDataToServer = ( location ) => {
                let animations = this.editor.export(this.editor.getAnimationsToExport(), info.format, false);
                if(info.from == "Selected clips") {
                    this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                        if( a[0]<b[0] ) {
                            return -1;
                        }
                        return 1;
                    });
                    
                    const presetData = { clips:[], duration:0 };

                    let globalStart = 10000;
                    let globalEnd = -10000;
                    let clips = this.clipsTimeline.lastClipsSelected;
                    for( let i = 0; i < clips.length; i++ ) {
                        const [trackIdx, clipIdx] = clips[i];
                        const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                        if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                        if(clip.ready!=undefined) clip.ready = clip.fadein;
                        if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                        if(clip.relax!=undefined) clip.relax = clip.fadeout;
                        if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                        presetData.clips.push(clip);
                        globalStart = Math.min(globalStart, clip.start >= 0 ? clip.start : globalStart);
                        globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                    }
                    presetData.duration = globalEnd - globalStart;
                    presetData.preset = animations[0].name;
                    const preset = new ANIM.FacePresetClip( presetData );
    
                    //Convert data to bml file format
                    const data = preset.toJSON();
                    presetData.data = data.clips;
                    animations = [{name: animations[0].name, data: UTILS.dataToFile(JSON.stringify(presetData.data), animations[0].name, "application/json")}]
                }

                for( let i = 0; i < animations.length; i++ ) {                    
                    this.editor.uploadData(animations[i].name, animations[i].data, info.folder, location, () => {
                        this.closeDialogs();
                        LX.popup('"' + animations[i].name + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                    })
                }
            }
            const session = this.editor.remoteFileSystem.session;
            const user = session ? session.user : ""
            if( !user || user.username == "guest" ) {
                this.prompt = new LX.Dialog("Alert", d => {
                    d.addTextArea(null, "The animation will be saved locally. You must be logged in to save it into server.", null, {disabled:true, className: "nobg"});
                    const btn = d.addButton(null, "Login", () => {
                        this.prompt.close();
                        this.showLoginModal();
                    }, {width:"50%", buttonClass:"accent"});
                    btn.root.style.margin = "0 auto";
                }, {closable: true, modal: true})
                
            }
            else {
                saveDataToServer("server");
            }
        }, {formats: [ "BML"], folders:["signs",  "presets"], from: ["All clips", "Selected clips"], selectedFolder: folder, selectedFrom: (folder == "signs" ? "All clips" : null) } );
    }

    createClipsDialog() {
        // Create a new dialog
        let that = this;
        if(this.prompt && this.prompt.root.checkVisibility())
            return;
        const innerSelect = (asset) => {
           
                that.clipsTimeline.unSelectAllClips();
                let config = {properties: {hand: this.editor.dominantHand}};
                switch(asset.type) {
                    case "FaceLexemeClip": case "HeadClip":
                        config = {lexeme: asset.id.toUpperCase()};
                        break;
                    case "GazeClip":
                        config = {influence: asset.id.toUpperCase()};
                        break;
                    case "ShoulderClip":
                        let type = asset.id.split(" ")[1];
                        config["shoulder" + type] = 0.8;
                        break;
                    case "HandConstellationClip":
                        config.srcFinger = 1;
                        config.srcLocation = "Pad";
                        config.srcSide = "Back";
                        config.dstFinger = 1;
                        config.dstLocation = "Base";
                        config.dstSide = "Palmar"; 
                        break;    
                }

                that.clipsTimeline.addClip( new ANIM[asset.type](config), -1, that.clipsTimeline.currentTime);
                asset_browser.clear();
                dialog.close();
        }
        let previewActions =  [{
            type: "Clip",
            name: 'Add clip', 
            callback: innerSelect,
            allowedTypes: ["Clip"]
        }];

        let asset_browser = null;
        let dialog = this.prompt = new LX.Dialog('Available behaviours', (p) => {

            let asset_data = [{id: "Face", type: "folder", children: []}, {id: "Head", type: "folder",  children: []}, {id: "Arms", type: "folder",  children: []}, {id: "Hands", type: "folder",  children: []}, {id: "Body", type: "folder",  children: []}];
                
            // FACE CLIP

            // Face lexemes
            let values = ANIM.FaceLexemeClip.lexemes;
            let lexemes = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "FaceLexemeClip",
                    src: "./data/imgs/thumbnails/face lexemes/" + values[i].toLowerCase() + ".png"
                }
                lexemes.push(data);
            }
            previewActions.push({
                type: "FaceLexemeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // Face lexemes & Mouthing clips
            asset_data[0].children = [{ id: "Face lexemes", type: "folder", children: lexemes}, {id: "Mouthing", type: "MouthingClip"}];
            previewActions.push({
                type: "MouthingClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // HEAD
            // Gaze clip
            values = ANIM.GazeClip.influences;
            let gazes = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "GazeClip",
                }
                gazes.push(data);
            }

            previewActions.push({
                type: "GazeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // Head movemen clip
            values = ANIM.HeadClip.lexemes;
            let movements = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "HeadClip",
                }
                movements.push(data);
            }
            previewActions.push({
                type: "HeadClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            asset_data[1].children = [{ id: "Gaze", type: "folder", children: gazes}, {id: "Head movement", type: "folder", children: movements}];

            asset_data[2].children = [{id: "Elbow Raise", type: "ElbowRaiseClip"}, {id: "Shoulder Raise", type: "ShoulderClip"}, {id:"Shoulder Hunch", type: "ShoulderClip"}, {id: "Arm Location", type: "ArmLocationClip"}, {id: "Hand Constellation", type: "HandConstellationClip"}, {id: "Directed Motion", type: "DirectedMotionClip"}, {id: "Circular Motion", type: "CircularMotionClip"}];
            previewActions.push({
                type: "ElbowRaiseClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "ShoulderClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "ArmLocationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "HandConstellationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "DirectedMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "CircularMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            asset_data[3].children = [{id: "Palm Orientation", type: "PalmOrientationClip"}, {id: "Hand Orientation", type: "HandOrientationClip"}, {id: "Handshape", type: "HandshapeClip"}, {id: "Wrist Motion", type: "WristMotionClip"}, {id: "Fingerplay Motion", type: "FingerplayMotionClip"}];
            previewActions.push({
                type: "PalmOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "HandOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "WristMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "FingerplayMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // BODY
            asset_data[4].children.push({id: "Body movement", type: "BodyMovementClip"});
            previewActions.push({
                type: "BodyMovementClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })

            asset_browser = new LX.AssetView({ previewActions });
            p.attach( asset_browser );

            asset_browser.load( asset_data, (e,v) => {
                switch(e.type) {
                    case LX.AssetViewEvent.ASSET_SELECTED: 
                        if(e.multiple)
                            console.log("Selected: ", e.item); 
                        else
                            console.log(e.item.id + " selected"); 
                        break;
                    case LX.AssetViewEvent.ASSET_DELETED: 
                        console.log(e.item.id + " deleted"); 
                        break;
                    case LX.AssetViewEvent.ASSET_CLONED: 
                        console.log(e.item.id + " cloned"); 
                        break;
                    case LX.AssetViewEvent.ASSET_RENAMED:
                        console.log(e.item.id + " is now called " + e.value); 
                        break;
                    case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                        if(e.item.type == "folder")
                            return;
                        innerSelect(e.item);                        
                        break;
                }
            })
        },{ title:'Lexemes', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: true, contextMenu: false,
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
         });
       
    }

    createServerClipsDialog() {
        
        const session = this.editor.remoteFileSystem.session;
       
        const username = session ? session.user.username : "guest";
        const repository = this.editor.remoteFileSystem.repository;

        if( this.prompt && this.prompt.root.checkVisibility() ) {
            return;
        }

        // Create a new dialog
        const dialog = this.prompt = new LX.Dialog('Available animations', async (p) => {
            
            const innerSelect = async (asset, button, e, action) => {
                const choice = document.getElementById("choice-insert-mode");
                if(choice) {
                    choice.remove();
                }
                switch(button) {
                    case "Add as single clip":
                        this.mode = ClipModes.Phrase;
                        break;
                    case "Breakdown into glosses":
                        this.mode = ClipModes.Glosses;
                        break;
                    case "Breakdown into action clips":
                        this.mode = ClipModes.Actions;
                        break;
                }
                this.clipsTimeline.unSelectAllClips();
                asset.animation.name = asset.id;

                dialog.panel.loadingArea.show();
                this.loadBMLClip(asset.animation)
                dialog.panel.loadingArea.hide();
    
                assetViewer.clear();
                dialog.close();
            }

            const previewActions = [
                {
                    type: "sigml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "sigml",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "sigml",
                    name: 'Breakdown into glosses', 
                    callback: innerSelect
                },
                {
                    type: "sigml",
                    name: 'Breakdown into action clips', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bml",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'Breakdown into glosses', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'Breakdown into action clips', 
                    callback: innerSelect
                }
            ];

            if( username != "guest" ) {
                const folders = ["signs", "presets", "clips"];
                for( let i = 0; i < folders.length; i++ ) {
                    const folder = folders[i];
                    previewActions.push(
                    {
                        type: "sigml",
                        path: "@/Local/" + folder,
                        name: 'Upload to server', 
                        callback: (item)=> {
                            this.editor.uploadData(item.filename + ".sigml", item.data, folder, "server", () => {
                                this.closeDialogs();
                                LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New "+ folder +"!", {position: [ "10px", "50px"], timeout: 5000});
                                
                            });
                        }
                    });
                    previewActions.push({
                        type: "bml",
                        path: "@/Local/" + folder,
                        name: 'Upload to server', 
                        callback: (item)=> {
                            this.editor.uploadData(item.filename + ".bml", item.data, folder, "server", () => {
                                this.closeDialogs();
                                LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New "+ folder +"!", {position: [ "10px", "50px"], timeout: 5000});
                                
                            });
                        }
                    });
                    previewActions.push({
                        type: "bvh",
                        path: "@/Local/" + folder,
                        name: 'Delete', 
                        callback: ( item )=> {
                            this.editor.localStorage[0].children.map( child => {
                                if( child.id == folder ) {
                                    const i = child.children.indexOf(item);
                                    const items = child.children;
                                    child.children = items.slice(0, i).concat(items.slice(i+1));  
                                }
                            })
                        }
                    });
                    previewActions.push({
                        type: "bvhe",
                        path: "@/Local/" + folder,
                        name: 'Delete', 
                        callback: ( item )=> {
                            cthis.editor.localStorage[0].children.map( child => {
                                if( child.id == folder ) {
                                    const i = child.children.indexOf(item);
                                    const items = child.children;
                                    child.children = items.slice(0, i).concat(items.slice(i+1));  
                                }
                            })                        
                        }
                    });    
                    previewActions.push({
                        type: "sigml",
                        path: "@/"+ username + "/" + folder,
                        name: 'Delete', 
                        callback: (item)=> {
                            this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                                if(v) {
                                    LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                    item.folder.children = v;
                                    assetViewer._deleteItem(item);
                                }
                                else {
                                    LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});
    
                                }
                                // this.closeDialogs();                            
                            });
                        }
                    });
                    previewActions.push({
                        type: "bml",
                        path: "@/"+ username + "/" + folder,
                        name: 'Delete', 
                        callback: (item)=> {
                            this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                                if(v) {
                                    LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                    item.folder.children = v;
                                    assetViewer._deleteItem(item);
                                }
                                else {
                                    LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});
    
                                }
                                // this.closeDialogs();                            
                            });
                        }
                    });
                }
            }
            
            const assetViewer = new LX.AssetView({  allowedTypes: ["sigml", "bml"],  previewActions: previewActions, contextMenu: false});
            p.attach( assetViewer );
            
            const loadingArea = p.loadingArea = this.createLoadingArea(p);

            if( !repository.length ) {
                await this.editor.remoteFileSystem.loadAllUnitsFolders( () => {
                    let repository = this.editor.remoteFileSystem.repository;
                    this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                    loadingArea.hide();
                }, ["signs", "presets"]);
            }
            else {            
                this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                loadingArea.hide();
            }

            
        }, { title:'Available animations', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: false,  modal: true,
    
            onclose: (root) => {
                if( modal.destroy ) {
                    modal.destroy();
                }
                root.remove();

                this.prompt = null;
                if( !LX.modal.hidden ) {
                    LX.modal.toggle(true);
                }
                if( this.choice ) {
                    this.choice.close();
                }
            }
        });
    }

    loadAssets( assetViewer, repository, onSelectFile ) {
        assetViewer.load( repository , async e => {
            switch(e.type) {
                case LX.AssetViewEvent.ASSET_SELECTED: 
                    //request data
                    if( e.item.type == "folder" ) {
                        return;
                    }
                    
                    if( !e.item.animation ) {
                        const promise = new Promise((resolve) => {
                            this.editor.fileToAnimation(e.item, ( file ) => {
                                if( file ) {
                                    resolve(file);
                                }
                                else {
                                    resolve( null );
                                }
                            });
                        })

                        const parsedFile = await promise;
                        e.item.animation = parsedFile.animation;
                        e.item.content = parsedFile.content;
                    }
                    
                    if(e.multiple) {
                        console.log("Selected: ", e.item);
                    }
                    else {
                        console.log(e.item.id + " selected");
                    }
                        
                    break;
                case LX.AssetViewEvent.ASSET_DELETED: 
                    console.log(e.item.id + " deleted"); 
                    break;
                case LX.AssetViewEvent.ASSET_CLONED: 
                    console.log(e.item.id + " cloned"); 
                    break;
                case LX.AssetViewEvent.ASSET_RENAMED:
                    console.log(e.item.id + " is now called " + e.value); 
                    break;
                case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                    if(e.item.type != "folder") {
                        const dialog = new LX.Dialog("Add clip", async (p) => {
                            if( !e.item.animation ) {
                                const promise = new Promise((resolve) => {
                                    this.editor.fileToAnimation(e.item, (file) => {
                                        if( file ) {
                                            resolve(file);
                                        }
                                        else {
                                            resolve( null );
                                        }
                                    });
                                })
                                const parsedFile = await promise;
                                e.item.animation = parsedFile.animation;
                                e.item.content = parsedFile.content;
                            }

                            p.addTextArea(null, "How do you want to insert the clip?", null, {disabled:true, className: "nobg"});
                            p.sameLine(3);
                            p.addButton(null, "Add as single clip", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Phrase;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            });
                            p.addButton(null, "Breakdown into glosses", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Glosses;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            });
                            p.addButton(null, "Breakdown into action clips", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Actions;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            });
                        }, {modal:true, closable: true, id: "choice-insert-mode"})
                    }
                    break;

                case LX.AssetViewEvent.ENTER_FOLDER:
                    if( e.item.unit && !e.item.children.length ) { 
                        assetViewer.parent.loadingArea.show();

                        this.editor.remoteFileSystem.getFiles(e.item.unit, e.item.fullpath, (files, resp) => {
                            const files_data = [];
                            if( files ) {
                                
                                for( let f = 0; f < files.length; f++ ) {
                                    files[f].id = files[f].filename;
                                    files[f].folder = e.item;
                                    files[f].type = UTILS.getExtension(files[f].filename);
                                    files[f].lastModified = files[f].timestamp;
                                    if(files[f].type == "txt") {
                                        continue;
                                    }
                                    files_data.push(files[f]);
                                }
                                e.item.children = files_data;
                            }
                            assetViewer.currentData = files_data;
                            assetViewer._updatePath(assetViewer.currentData);

                            if( !assetViewer.skipBrowser ) {
                                assetViewer._createTreePanel();
                            }
                            assetViewer._refreshContent();

                            assetViewer.parent.loadingArea.hide();
                        })
                    }
                    break;
            }
        })
    }

    createExportBMLDialog() {
        this.prompt = LX.prompt("File name", "Export BML animation", (v) => this.editor.export(null, "", true, v), {input: this.editor.getCurrentAnimation().saveName, required: true} )  
    }

    showSourceCode (asset) {
        if( window.dialog ) {
            window.dialog.destroy();
        }
    
        window.dialog = new LX.PocketDialog("Editor", p => {
            const area = new LX.Area();
            p.attach( area );

            const filename = asset.filename;
            const type = asset.type;
            const name = filename.replace("."+ type, "");
            
            const codeEditor = new LX.CodeEditor(area, {
                allow_add_scripts: false,
                name: type,
                title: name,
                disable_edition: true
            });

            const text = JSON.stringify(asset.animation.behaviours, (key, value) => {
                // limit precision of floats
                if( typeof value === 'number' ) {
                    return parseFloat(value.toFixed(3));
                }
                if( key == "gloss" ) {
                    return value.replaceAll(":", "_")
                }
                return value;
            });
            if( asset.type == "sigml" ) {
                codeEditor.setText(asset.content);
                codeEditor.addTab("bml", false, name);
                codeEditor.openedTabs["bml"].lines = codeEditor.toJSONFormat(text).split('\n');
                codeEditor.openedTabs["bml"].language = 'JSON'
            }
            else {
                codeEditor.setText(codeEditor.toJSONFormat(text));
            }
            codeEditor._changeLanguage( "JSON" );
            
        }, { size: ["40%", "600px"], closable: true });

    }

    createSceneUI(area) {

        let editor = this.editor;
        let canvasButtons = [
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'Grid',
                selectable: true,
                selected: true,
                callback: (v, e) => {
                    editor.showGUI = !editor.showGUI;

                    editor.scene.getObjectByName('Grid').visible = editor.showGUI;
                  
                    if(editor.showGUI) {
                        this.showTimeline();
                        this.sidePanel.parentArea.reduce();                       
                        
                    } else {
                        this.hideTimeline();
                        this.sidePanel.parentArea.extend();

                    }
                }
            },
    
        ]
        area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }

    
}

class PropagationWindow {

    /*
     * @param {Lexgui timeline} timeline must be valid 
     */
    constructor( timeline ){

        this.timeline = timeline; // will provide the canvas
        
        this.curveWidget = null; 
        this.showCurve = false;
        
        this.showLimits = false;

        this.enabler = true;
        this.resizing = 0; // -1 resizing left, 0 nothing, 1 resizing right

        this.time = 0; // seconds
        this.rightSide = 1; // seconds
        this.leftSide = 1;  // seconds

        this.opacity = 0.6;
        this.lexguiColor = '#273162';
        this.gradientColorLimits = "rgba( 39, 49, 98, 0%)"; // relies on lexgui input
        this.gradientColor = "rgba( 39, 49, 98"; // relies on lexgui input
        this.borderColor = LX.getThemeColor( "global-text-secondary" );
        this.gradient = [ [0.5,1] ]; // implicit 0 in the borders
        // radii = 100;

        // create curve Widget
        const bgColor = "#cfcdcd"; // relies on lexgui input
        const pointsColor = "#273162"; // relies on lexgui input
        const lineColor = "#1c1c1d"; // relies on lexgui input
        const lpos = timeline.timeToX( this.time - this.leftSide );
        const rpos = timeline.timeToX( this.time + this.rightSide );

        this.curveWidget = new LX.Curve( null, this.gradient, (v,e) => {
                if ( v.length <= 0){
                    this.curveWidget.curveInstance.element.value = this.gradient = [[0.5,1]];
                }
                this.curveWidget.curveInstance.redraw();
            },
            {xrange: [0,1], yrange: [0,1], allowAddValues: true, moveOutAction: LX.CURVE_MOVEOUT_DELETE, smooth: 0, signal: "@propW_gradient", width: rpos-lpos -0.5, height: 25, bgColor, pointsColor, lineColor } 
        );
        const curveElement = this.curveWidget.root; 
        curveElement.style.width = "fit-content";
        curveElement.style.height = "fit-content";
        curveElement.style.position = "fixed";
        curveElement.style.borderRadius = "0px";
        curveElement.children[0].style.borderRadius = "0px 0px " + timeline.trackHeight*0.4 +"px " + timeline.trackHeight*0.4 +"px";
        curveElement.style.zIndex = "0.5";
        curveElement.style.padding = "0px";

        this.updateTheme();
        LX.addSignal( "@on_new_color_scheme", (el, value) => {
            // Retrieve again the color using LX.getThemeColor, which checks the applied theme
            this.updateTheme();
        } )
    }

    updateTheme(){
        this.borderColor = LX.getThemeColor( "global-text-secondary" );
    }

    setEnabler( v ){
        this.enabler = v;
        if(!v) {
            this.setCurveVisibility( false );
        }
        LX.emit( "@propW_enabler", this.enabler );
    }
    
    toggleEnabler(){
        this.setEnabler( !this.enabler );
    }

    recomputeGradient( newLeftSide, newRightSide ){
        let g = this.gradient;

        const oldMid = this.leftSide / (this.leftSide + this.rightSide);
        const newMid = newLeftSide / (newLeftSide + newRightSide);
        for( let i  = 0; i < g.length; ++i ){
            let gt = g[i][0]; 
            if ( gt <= oldMid ){
                g[i][0] = ( gt / oldMid ) * newMid;
            }
            else{
            g[i][0] = ( (gt - oldMid) / (1-oldMid)) * (1-newMid) + newMid ;
            }
        }

        this.leftSide = newLeftSide;
        this.rightSide = newRightSide;
    }

    setTimeline( timeline ){
        this.timeline = timeline;
        
        this.curveWidget.root.remove(); // remove from dom, wherever this is
        if(this.showCurve){
            this.timeline.canvasArea.root.appendChild( this.curveWidget.root );
            this.updateCurve( true );
        }
    }

    setTime( time ){
        this.time = time;
        this.updateCurve(); // update only position
    }

    onOpenConfig(dialog){
        dialog.addCheckbox("Enable", this.enabler, (v) =>{
            this.setEnabler(v);
        }, { signal: "@propW_enabler"});

        dialog.sameLine();
        let w = dialog.addNumber("Min (s)", this.leftSide, (v) => {
            this.recomputeGradient( v, this.rightSide );
            this.updateCurve(true);
        }, {min: 0.001, step: 0.001, signal: "@propW_minT", width:"50%"});
        w.root.style.paddingLeft = 0;
        dialog.addNumber("Max (s)", this.rightSide, (v) => {
            this.recomputeGradient( this.leftSide, v );
            this.updateCurve(true);
        }, {min: 0.001, step: 0.001, signal: "@propW_maxT", width:"50%"});		
        dialog.endLine();

        dialog.addColor("Color", this.lexguiColor, (value, event) => {
            this.lexguiColor = value;
            let rawColor = parseInt(value.slice(1,7), 16);
            let color = "rgba(" + ((rawColor >> 16) & 0xff) + "," + ((rawColor >> 8) & 0xff) + "," + (rawColor & 0xff);
            this.gradientColorLimits = color + ",0%)"; 
            this.gradientColor = color;
            this.curveWidget.curveInstance.element.pointscolor = value;
            this.curveWidget.curveInstance.redraw();

            this.opacity = parseInt(value[7]+value[8], 16) / 255.0;
            this.curveWidget.root.style.opacity = this.opacity;
        }, {useAlpha: true});
    }

    onMouse( e, time ){

        if( !this.enabler ){ return false; }

        const timeline = this.timeline;

        const windowRect = this._getBoundingRectInnerWindow();
        const lpos = windowRect.rectPosX;
        const rpos = windowRect.rectPosX + windowRect.rectWidth;

        const timelineState = timeline.grabbing | timeline.grabbingTimeBar | timeline.grabbingScroll | timeline.movingKeys | timeline.boxSelection;
        
        const isInsideResizeLeft = Math.abs( e.localX - lpos ) < 7 && e.localY > windowRect.rectPosY;
        const isInsideResizeRight = Math.abs( e.localX - rpos ) < 7 && e.localY > windowRect.rectPosY;

        if ( !timelineState && ( isInsideResizeLeft || isInsideResizeRight ) ){
            timeline.canvas.style.cursor = "col-resize";
        }
        
        if ( e.type == "mousedown" && (isInsideResizeLeft || isInsideResizeRight) ){
            this.resizing = isInsideResizeLeft ? -1 : 1; 
        }

        if( e.localX >= lpos && e.localX <= rpos && e.localY > windowRect.rectPosY && e.localY <= (windowRect.rectPosY + windowRect.rectHeight)) {
            this.showLimits = true;
        }
        else if(!this.resizing) { // outside of window
            
            if(e.type == "mousedown") {
                this.setCurveVisibility( false );
            }
            this.showLimits = false;
        }

        if ( this.resizing && e.type == "mousemove" ){
            if ( this.resizing == 1 ){
                const t = Math.max( 0.001, time - this.time );
                this.recomputeGradient(this.leftSide, t);
                LX.emit("@propW_maxT", t); 
            }else{
                const t = Math.max( 0.001, this.time - time );
                this.recomputeGradient(t, this.rightSide);
                LX.emit("@propW_minT", t); 
            }
            this.showLimits = true;
            if(this.showCurve) {
                this.updateCurve( true );
            }
        }
        else if(timeline.grabbing && this.showCurve) {
            this.updateCurve(); // update position of curvewidget
        }

        if ( e.type == "wheel" ){
            this.updateCurve(true);
        }

        if( this.resizing ){
            timeline.grabbing = false;
            timeline.grabbingTimeBar = false;
            timeline.grabbingScroll = false;
            timeline.movingKeys = false;
            timeline.timeBeforeMove = null;
            timeline.boxSelection = false;
            // timeline.unSelectAllKeyFrames();
            timeline.unHoverAll();

            if ( e.type == "mouseup" ){
                this.resizing = 0;
            }
        }
        
        return true;
    }

    onDblClick( e ) {
        if ( !this.enabler || !this.showLimits ){ return; }

        const timeline = this.timeline;
        const lpos = timeline.timeToX( this.time - this.leftSide );
        const rpos = timeline.timeToX( this.time + this.rightSide );

        if( e.localX >= lpos && e.localX <= rpos && e.localY > timeline.topMargin) {
            timeline.grabbing = false;
            this.setCurveVisibility( true );
        }
    }

    setCurveVisibility( visibility ){
        if (!visibility){
            this.showCurve = false;
            this.curveWidget.root.remove(); // detach from timeline (if any)
        }else{
            const oldVisibility = this.showCurve;
            this.showCurve = true;
            if ( !oldVisibility ){ // only do update on visibility change
                this.timeline.canvasArea.root.appendChild( this.curveWidget.root );
                this.updateCurve(true);
            }
        }

    }

    updateCurve( updateSize = false ) {
        if( !(this.enabler && this.showCurve) ){ return false; }

        const timeline = this.timeline;

        const windowRect = this._getBoundingRectInnerWindow();

		let areaRect = timeline.canvas.getBoundingClientRect();

        this.curveWidget.root.style.left = areaRect.x + windowRect.rectPosX + "px";
        this.curveWidget.root.style.top = areaRect.y + windowRect.rectPosY + windowRect.rectHeight -2 + "px";

        if(updateSize) {
            const canvas = this.curveWidget.curveInstance.canvas;
            canvas.width = windowRect.rectWidth;
            canvas.style.width = windowRect.rectWidth + "px";


            const radii = timeline.trackHeight * 0.4;
			let leftRadius = windowRect.leftSize > radii ? radii : windowRect.leftSize;
	        leftRadius = windowRect.rectHeight > leftRadius ? leftRadius : (windowRect.rectHeight*0.5);
        
	        let rightRadius = windowRect.rightSize > radii ? radii : windowRect.rightSize;
	        rightRadius = windowRect.rectHeight > rightRadius ? rightRadius : (windowRect.rectHeight*0.5);

			canvas.style.borderBottomLeftRadius = leftRadius + "px";
			canvas.style.borderBottomRightRadius = rightRadius + "px";

            this.curveWidget.curveInstance.redraw();
        }
    }

    _getBoundingRectInnerWindow(){
        const timeline = this.timeline;
        let rightSize = timeline.timeToX(this.rightSide) - timeline.timeToX(0); 
        let leftSize = timeline.timeToX(this.leftSide) - timeline.timeToX(0);

        let rectWidth = leftSize + rightSize;
		let rectHeight = Math.min(
            timeline.canvas.height - timeline.topMargin - 2 - (this.showCurve ? this.curveWidget.curveInstance.canvas.clientHeight : 0), 
            timeline.leftPanel.root.children[1].children[0].clientHeight - timeline.leftPanel.root.children[1].scrollTop + timeline.trackHeight*0.5
        );
        rectHeight = Math.max( rectHeight, 0 );

        let rectPosX = timeline.timeToX( this.time - this.leftSide);
        let rectPosY = timeline.topMargin + 1;

        return { rightSize, leftSize, rectWidth, rectHeight, rectPosX, rectPosY };
    }

    draw( ){
        if ( !this.enabler || this.timeline.playing ){ return; }

        const timeline = this.timeline;
        const ctx = timeline.canvas.getContext("2d");

        let { rightSize, leftSize, rectWidth, rectHeight, rectPosX, rectPosY } = this._getBoundingRectInnerWindow();

        let gradient = ctx.createLinearGradient(rectPosX, rectPosY, rectPosX + rectWidth, rectPosY );
        gradient.addColorStop(0, this.gradientColorLimits);
        for( let i = 0; i < this.gradient.length; ++i){
            const g = this.gradient[i];
            gradient.addColorStop(g[0], this.gradientColor + "," + g[1] +")");
        }
        gradient.addColorStop(1,this.gradientColorLimits);
        ctx.fillStyle = gradient;
        ctx.strokeStyle = this.borderColor;
        const oldAlpha = ctx.globalAlpha;
        ctx.globalAlpha = this.opacity;

        // compute radii
        let radii = this.showCurve ? (timeline.trackHeight * 0.4) : timeline.trackHeight;
        let leftRadii = leftSize > radii ? radii : leftSize;
        leftRadii = rectHeight > leftRadii ? leftRadii : rectHeight;
        
        let rightRadii = rightSize > radii ? radii : rightSize;
        rightRadii = rectHeight > rightRadii ? rightRadii : rectHeight;
                
        let radiusTL, radiusBL, radiusTR, radiusBR;
        radiusTL = leftRadii;
        radiusBL = this.showCurve ? 0 : leftRadii;
        radiusTR = rightRadii;
        radiusBR = this.showCurve ? 0 : rightRadii;

        // draw window rect
        ctx.beginPath();

        ctx.moveTo(rectPosX, rectPosY + radiusTL);
        ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + radiusTL, rectPosY );
        ctx.lineTo( rectPosX + rectWidth - radiusTR, rectPosY );
        ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + radiusTR );
        ctx.lineTo( rectPosX + rectWidth, rectPosY + rectHeight - radiusBR );
        ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - radiusBR, rectPosY + rectHeight );
        ctx.lineTo( rectPosX + radiusBL, rectPosY + rectHeight );
        ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - radiusBL );

        ctx.closePath();
        ctx.fill();
        
        ctx.lineWidth = 1;
        if(this.showCurve) {
            rectHeight = rectHeight + this.curveWidget.curveInstance.canvas.clientHeight - 2;
            ctx.beginPath();
            ctx.lineTo(rectPosX, rectPosY + leftRadii);
            ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + leftRadii, rectPosY );
            ctx.lineTo( rectPosX + rectWidth - rightRadii, rectPosY );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + rightRadii );
            ctx.lineTo( rectPosX + rectWidth, rectPosY + rectHeight - rightRadii );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - rightRadii, rectPosY + rectHeight );
            ctx.lineTo( rectPosX + leftRadii, rectPosY + rectHeight );
            ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - leftRadii );
            ctx.closePath();
            ctx.stroke();
        }
        else if(this.showLimits){
            ctx.beginPath();
            ctx.moveTo(rectPosX, rectPosY + radiusTL*0.5);
            ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + radiusTL*0.5, rectPosY );
            ctx.moveTo( rectPosX + rectWidth - radiusTR*0.5, rectPosY );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + radiusTR*0.5 );
            ctx.moveTo( rectPosX + rectWidth, rectPosY + rectHeight - radiusBR*0.5 );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - radiusBR*0.5, rectPosY + rectHeight );
            ctx.moveTo( rectPosX + radiusBL*0.5, rectPosY + rectHeight );
            ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - radiusBL*0.5 );
            ctx.stroke();
        }

        ctx.globalAlpha = oldAlpha;
        
    }
}

export { Gui, KeyframesGui, ScriptGui };
