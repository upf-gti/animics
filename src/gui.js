import { UTILS } from "./utils.js";
import { VideoUtils } from "./video.js"; 
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';
import { LX } from 'lexgui';
import 'lexgui/components/codeeditor.js';
import 'lexgui/components/timeline.js';

class Gui {

    constructor(editor) {
       
        this.timelineVisible = false;
        this.currentTime = 0;
        this.editor = editor;

        this.create();

    }

    create() {

        // Create main area
        this.mainArea = LX.init();
        this.mainArea.root.ondrop = (e) => {
			e.preventDefault();
			e.stopPropagation();
	
			const file = e.dataTransfer.files[0];
            if(!file)
                return;
			this.editor.loadFile(file);
      
        };
        // Create menu bar
        this.createMenubar(this.mainArea);
        
        // split main area
        this.mainArea.split({sizes:["80%","20%"], minimizable: true});
        
        //left -> canvas, right -> side panel
        var [left, right] = this.mainArea.sections;
        left.id = "canvasarea";
        left.root.style.position = "relative";
        right.id = "sidepanel";
        [this.canvasArea, this.timelineArea] = left.split({sizes: ["80%", "20%"], minimizable: true, type: "vertical"});
        // this.canvasArea = left;
        this.sidePanel = right;
       
        //Create timelines (keyframes and clips)
        this.createTimelines();
    }

    /** Create menu bar */
    createMenubar(area) {

        this.menubar = area.addMenubar( m => {

            m.setButtonImage("SignON", "data/imgs/animics_logo.png", null, {float: "left"});
            

        });
    }

    updateMenubar() {
        // var that = this;
        let menubar = this.menubar;
        
        
        // menubar.add("Project/");
        if(this.editor.mode == this.editor.eModes.script)
            menubar.add("Project/Import animation", {icon: "fa fa-file-import", callback: () => this.importFile(), short: "CTRL+I"
        });
  
        // Export animation
        menubar.add("Project/Export animation", {icon: "fa fa-file-export"});
       
        if(this.editor.mode == this.editor.eModes.script) {
            menubar.add("Project/Export animation/Export BML", {callback: () => this.createExportBMLDialog() 
            });
        }

        menubar.add("Project/Export animation/Export extended BVH", {callback: () => {
            this.prompt = LX.prompt("File name", "Export BVH animation", (v) => this.editor.export("BVH extended", v), {input: this.editor.clipName, required: true } );      
        }});

        menubar.add("Project/Export scene", {icon: "fa fa-download"});
        menubar.add("Project/Export scene/Export GLB", {callback: () => 
            this.prompt = LX.prompt("File name", "Export GLB", (v) => this.editor.export("GLB", v), {input: this.editor.clipName, required: true} )     
        });

        // Save animation
        menubar.add("Project/Save animation", {short: "CTRL+S", callback: () => 
            this.createNewSignDialog(null, "server")
        });

        menubar.add("Project/Preview in PERFORMS", {icon: "fa fa-street-view",  callback: () => this.editor.showPreview() });

        // menubar.add("Timeline/");
        menubar.add("Timeline/Shortcuts", { icon: "fa fa-keyboard", disabled: true });
        menubar.add("Timeline/Shortcuts/Play-Pause", { short: "SPACE" });
        menubar.add("Timeline/Shortcuts/Zoom", { short: "Hold LSHIFT+Wheel" });
        menubar.add("Timeline/Shortcuts/Scroll", { short: "Wheel" });
        menubar.add("Timeline/Shortcuts/Move timeline", { short: "Left Click+Drag" });
        menubar.add("Timeline/Shortcuts/Save sign", { short: "CTRL+S" });
        
        if(this.editor.mode == this.editor.eModes.script) {
            menubar.add("Timeline/Shortcuts/Create preset", { short: "Right click" });
            menubar.add("Timeline/Shortcuts/Add clip", { short: "CTRL+K" });
            menubar.add("Timeline/Shortcuts/Add preset", { short: "CTRL+P" });
            menubar.add("Timeline/Shortcuts/Add sign", { short: "CTRL+L" });
            menubar.add("Timeline/Shortcuts/Move clips", { short: "Hold CTRL" });
            menubar.add("Timeline/Shortcuts/Add clips", { short: "Right Click" });
            menubar.add("Timeline/Shortcuts/Copy clips", { short: "Right Click" });
            menubar.add("Timeline/Shortcuts/Copy clips", { short: "CTRL+C" });
            menubar.add("Timeline/Shortcuts/Delete clips");
            menubar.add("Timeline/Shortcuts/Delete clips/Single", { short: "DEL" });
            menubar.add("Timeline/Shortcuts/Delete clip/Multiple", { short: "Hold LSHIFT+DEL" });
            menubar.add("Timeline/Shortcuts/Clip Selection");
            menubar.add("Timeline/Shortcuts/Clip Selection/Single", { short: "Left Click" });
            menubar.add("Timeline/Shortcuts/Clip Selection/Multiple", { short: "Hold LSHIFT" });
        }
        else {
            menubar.add("Timeline/Shortcuts/Move keys", { short: "Hold CTRL" });
            menubar.add("Timeline/Shortcuts/Change value keys (face)", { short: "Hold ALT" });
            menubar.add("Timeline/Shortcuts/Add keys", { short: "Right Click" });
            menubar.add("Timeline/Shortcuts/Delete keys");
            menubar.add("Timeline/Shortcuts/Delete keys/Single", { short: "DEL" });
            menubar.add("Timeline/Shortcuts/Delete keys/Multiple", { short: "Hold LSHIFT" });
            menubar.add("Timeline/Shortcuts/Key Selection");
            menubar.add("Timeline/Shortcuts/Key Selection/Single", { short: "Left Click" });
            menubar.add("Timeline/Shortcuts/Key Selection/Multiple", { short: "Hold LSHIFT" });
            menubar.add("Timeline/Shortcuts/Key Selection/Box", { short: "Hold LSHIFT+Drag" });
            menubar.add("Timeline/Optimize all tracks", { callback: () => this.editor.optimizeTracks() });
        }


        menubar.add("Timeline/Clear tracks", { callback: () => this.editor.clearAllTracks() });
        if(this.showVideo)
            menubar.add("View/Show video", { type: "checkbox", checked: this.showVideo, callback: (v) => {
                this.showVideo = v;
                const tl = document.getElementById("capture");
                tl.style.display = this.showVideo ? "flex": "none";
            }});
        // menubar.add("View/Show timeline", { type: "checkbox", checked: this.timelineVisible, callback: (v) => {
        //     if(v)
        //         this.showTimeline();
        //     else
        //         this.hideTimeline();
        // }});

        if(this.editor.mode == this.editor.eModes.script) {
            // menubar.add("Help/");
            menubar.add("Help/Tutorial", {callback: () => window.open("docs/script_animation.html", "_blank")});
            menubar.add("Help/BML Instructions", {callback: () => window.open("https://github.com/upf-gti/performs/blob/main/docs/InstructionsBML.md", "_blank")});
        }
        else {
            menubar.add("Help/Tutorial", {callback: () => window.open("docs/keyframe_animation.html", "_blank")});
        }

        menubar.addButtons( [
            {
                title: "Play",
                icon: "fa-solid fa-play",
                callback:  (domEl) => { 
                    console.log("play!"); 
                    if(this.editor.state ) {
                        this.editor.pause(this.editor, domEl);    
                    }
                    else {
                        
                        this.editor.play(this.editor, domEl);
                    }
                    domEl.classList.toggle('fa-play'), domEl.classList.toggle('fa-pause');
                }
            },
            {
                title: "Stop",
                icon: "fa-solid fa-stop",
                callback:  (domEl) => { 
                    this.editor.stop(this.editor, domEl);
                    // domEl.innerHTML = "<i class='bi bi-play-fill'></i>";
                    console.log("pause!") 
                    if(this.menubar.getButton("Play").children[0].classList.contains("fa-pause")) 
                        this.menubar.getButton("Play").children[0].classList.toggle('fa-pause'), this.menubar.getButton("Play").children[0].classList.toggle('fa-play');
                }
            }
        ]);
       
        menubar.add("Login", {callback: () => {
            const session = this.editor.FS.getSession();
            if(this.prompt && this.prompt.root.checkVisibility())
                return;
            if(session && session.user.username != "signon")
                this.showLogoutModal();
            else
                this.showLoginModal();            
            
            }
        }, {float:"right"});
        menubar.setButtonIcon("Github", "fa-brands fa-github", () => {window.open("https://github.com/upf-gti/animics")}, {float:"right"});
    }

    importFile () {
        
        const input = document.createElement('input');
        input.type = 'file';
        input.click();

        input.onchange = (e) => {
            const file = e.currentTarget.files[0];
            this.editor.loadFile(file);
        }
    }

    showLoginModal(session = {user: null, password: null}) {
        this.prompt = new LX.Dialog("Login", (p) => {
            const refresh = (p, msg) => {
                p.clear();
                if(msg) {
                    p.addText(null, msg, null, {disabled: true, warning: true});
                }
                p.addText("User", session.user, (v) => {
                    session.user = v;
                });
                p.addText("Password", session.password, (v) => {
                    session.password = v;
                }, {type: "password"});
                p.sameLine(2);
                p.addButton(null, "Cancel", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                });
    
                p.addButton(null, "Login", (v) => {
                    this.editor.login(session, (session, response) => {
                        if(response.status == 1) {
                            let el = document.querySelector("#Login");
                            el.innerText = session.user.username;
                            this.editor.getUnits();
                            this.prompt.close();
                            this.prompt = null;
                        }
                        else {
                            refresh(p, response.msg);
                        }
                    });
                }, { buttonClass: "accept" });

                p.addButton(null, "Sign up", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                    this.showCreateAccountDialog(session);
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
            this.editor.logout(() => {
                let el = document.querySelector("#Login");
                el.innerText = "Login";
                this.editor.FS.login("signon", "signon", this.editor.getUnits.bind(this.editor))

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
                        this.editor.createAccount(user, pass, email, (request) => {
                            
                                this.prompt.close();
                                this.prompt = null;
                                let el = document.querySelector("#Login");
                                el.innerText = session.user;
                                // this.showLoginModal( { user: user, password: pass});
                            }, (request)  => {
                                refresh(p, "Server status: " + request.msg);
                                console.error(request.msg);
                            }
                        );
                    }
                    else
                    {
                        refresh(p, "Please confirm password");
                        console.error("Wrong pass confirmation");
                    }
                }, { buttonClass: "accept" })
            }
            refresh(p);
        }, {modal: true, closable: true});
            
    }

    createSceneUI(area) {

        $(this.editor.orientationHelper.domElement).show();

        let editor = this.editor;
        let canvasButtons = []
        
        if(editor.scene.getObjectByName("Armature")) {
            canvasButtons = [
                {
                    name: 'Skin',
                    property: 'showSkin',
                    icon: 'bi bi-person-x-fill',
                    nIcon: 'bi bi-person-check-fill',
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
                    icon: 'fa-solid fa-bone',
                    nIcon: 'fa-solid fa-bone',
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
        }
        
        canvasButtons = [...canvasButtons,
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'fa-solid fa-table-cells',
                selectable: true,
                selected: true,
                callback: (v, e) => {
                    editor.showGUI = !editor.showGUI;

                    if(editor.scene.getObjectByName('Armature'))
                        editor.scene.getObjectByName('SkeletonHelper').visible = editor.showGUI;
                    editor.scene.getObjectByName('GizmoPoints').visible = editor.showGUI;
                    editor.scene.getObjectByName('Grid').visible = editor.showGUI;
                    
                    if(!editor.showGUI) {
                        editor.gizmo.stop();
                        this.hideTimeline();
                        this.mainArea.extend();

                    } else {
                        this.showTimeline();
                        this.mainArea.reduce();
                    }
                    
                    
                    const video = document.getElementById("capture");
                    video.style.display = editor.showGUI ? "flex" : "none";
                }
            },
    
            {
                name: 'Joints',
                property: 'boneUseDepthBuffer',
                icon: 'fa-solid fa-circle-nodes',
                selectable: true,
                selected: true,
                callback: (v) =>  {
                    editor.gizmo.bonePoints.material.depthTest = !editor.gizmo.bonePoints.material.depthTest;
                }
            },
    
            {
                name: 'Animation loop',
                property: 'animLoop',
                selectable: true,
                selected: true,
                icon: 'fa-solid fa-person-walking-arrow-loop-left',
                callback: (v) =>  {
                    editor.animLoop = !editor.animLoop;
                    editor.setAnimationLoop(editor.animLoop);
                    
                }
            }
        ]
        area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }
    
    
    openSettings( settings ) {
        
        let prevDialog = document.getElementById("settings-dialog");
        if(prevDialog) prevDialog.remove();
        
        const dialog = new LX.Dialog(UTILS.firstToUpperCase(settings), p => {
            if(settings == 'gizmo') {
                this.editor.gizmo.showOptions( p );
            }
        }, { id: 'settings-dialog', close: true, width: 380, height: 210, scroll: false, draggable: true});

    }
    
     
    setBoneInfoState( enabled ) {
        for(const ip of $(".bone-position input, .bone-euler input, .bone-quaternion input"))
        enabled ? ip.removeAttribute('disabled') : ip.setAttribute('disabled', !enabled);
    }
    /** ------------------------------------------------------------ */

    /** -------------------- TIMELINE -------------------- */
    render() {

        if(this.timelineVisible)
            this.drawTimeline();
    }

    drawTimeline(currentTimeline) {
        
        if(this.timelineVisible)
            currentTimeline.draw();
        // const canvas = this.timelineCTX.canvas;
       

        // if(this.currentTime > this.duration) {
        //     this.currentTime = 0.0;
        //     this.editor.onAnimationEnded();
        // }
        // if(this.editor.activeTimeline)
        //     this.editor.activeTimeline.draw(this.currentTime);
        // this.keyFramesTimeline.draw(this.currentTime); //  [0, 0, canvas.width, canvas.height]
        // if(this.clipsTimeline)
        // {
           
        //     this.clipsTimeline.draw(this.currentTime, null, false);    // [0, 0, this.timelineNMFCTX.canvas.width, this.timelineNMFCTX.canvas.height]
        // }
        
    }

    showTimeline() {
  
        this.timelineVisible = true;
        this.editor.activeTimeline.show();
        this.timelineArea.parentArea.reduce();
    }

    hideTimeline() {
   
        this.timelineVisible = false;
        this.timelineArea.parentArea.extend();        
        this.editor.activeTimeline.hide();
    }
    
    /** ------------------------------------------------------------ */

    /** -------------------- ON EVENTS -------------------- */
    onSelectItem(item) {
        this.keyFramesTimeline.setSelectedItems( [item] );
        this.selectedItems = [item];
        this.tree.select(item);
    }

    resize(width, height) {
        //this.timelineArea.setSize([width, null]);
        this.editor.activeTimeline.resize();
    }

    async promptExit() {
        this.prompt = await new LX.Dialog("Exit confirmation", (p) => {
            p.addText(null, "Be sure you have exported the animation. If you exit now, your data will be lost. How would you like to proceed?", null, {disabled: true});
            p.addButton(null, "Export", () => {
                p.clear();
                p.addText("File name", this.editor.clipName, (v) => this.editor.clipName = v);
                p.addButton(null, "Export extended BVH", () => this.editor.export("BVH extended", this.editor.clipName), { buttonClass: "accept" });
                if(this.editor.mode == this.editor.eModes.script) {
                    p.addButton( null, "Export BML", () => this.editor.export("", this.editor.clipName ), { buttonClass: "accept" });
                }
                p.addButton( null, "Export GLB", () => this.editor.export("GLB", this.editor.clipName), { buttonClass: "accept" });
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
    createAnimation(options) {
        options = options || {size: ["80%", "70%"]};

        return new LX.Dialog(null, m => {
            const div = document.createElement("div");
            div.classList.add("load")

            let icon = document.createElement("div");
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
};

class KeyframesGui extends Gui {

    constructor(editor) {
        
        super(editor);
        
        this.showVideo = false;
        this.skeletonScroll = 0;

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
       
        //Create capture video window
        this.createCaptureArea(this.mainArea);
    }

    init() {
        this.createSidePanel();
     
        // automatic optimization of keyframes
        this.editor.optimizeTracks();
        this.updateMenubar()
        this.render();
        this.showTimeline();
        // Canvas UI buttons
        this.createSceneUI(this.canvasArea);
    }

    /** -------------------- CAPTURE GUI (app) --------------------  */
    createCaptureArea(area) {

        // Create capture info area
        let mainCapture = document.getElementById("capture");
        let captureArea = document.getElementById("capture-area");

        // Create video area
        let videoArea = document.getElementById("video-area");
        videoArea.classList.add("video-area");
        videoArea.style.paddingTop = "0px";
  
        // Create input selector widget (webcam or video)
        let selectContainer = new LX.Panel({id:"select-mode", height: "80px", weight: "50%"});
        selectContainer.sameLine();
        let selected = this.editor.eModes.capture == this.captureMode ? "webcam" : "video";

        selectContainer.addComboButtons("Input:", [
            {
                value: 'webcam',
                callback: (value, event) => {
                    this.editor.mode = this.editor.eModes.capture;
                    let inputEl = input.domEl.getElementsByTagName("input")[0];
                    inputEl.value = "";
                    input.domEl.classList.add("hidden");
                    this.editor.getApp().onBeginCapture();
                }
            }, {
                value: 'video',
                callback: (value, event) => {
                    let inputEl = input.domEl.getElementsByTagName("input")[0];
                    input.domEl.classList.remove("hidden");
                    inputEl.value = "";
                    inputEl.click();
                    this.editor.mode = this.editor.eModes.video;
                }
            }
        ], {selected: selected, width: "180px"});

        let input = selectContainer.addFile( "File:", (value, event) => {
            if(!value.type.includes("video")) {
                LX.message("Format not accepted");
                return;

            }
            this.editor.getApp().onLoadVideo( value );

        }, { id: "video-input", placeholder: "No file selected", local: false, type: "buffer", read: false, width: "200px"} );
        
        if(this.editor.eModes.capture == this.captureMode)
            input.domEl.classList.add("hidden");

        else if(this.editor.videoName) {
            input.domEl.getElementsByTagName("input")[0].value = this.editor.video;        
        }
        selectContainer.endLine("center");
        videoArea.prepend(selectContainer.root);

        // Create expand area button
        let i = document.createElement("i");
        i.id = "expand-capture-gui";
        i.style = "position: relative;top: 35px;left: -19px; width: 0px;";
        i.className = "fas fa-solid fa-circle-info drop-icon";//"fas fa-solid fa-circle-chevron-left drop-icon";
        i.addEventListener("click", () => this.changeCaptureGUIVisivility());

        // Create expanded AU info area
        let inspector = new LX.Panel({id:"capture-inspector", width: "800px"});
        inspector.root.hidden = true;
        inspector.root.style.padding = "5px";
        inspector.addBlank();
        inspector.addTitle("User positioning");
        inspector.addTextArea(null, 'Position yourself centered on the image with the hands and troso visible. If the conditions are not met, reposition yourself or the camera.', null, { disabled: true, className: "auto" }) 
        
        inspector.addProgress('Distance to the camera', 0, {min:0, max:1, id: 'progressbar-torso'});
        inspector.addProgress('Left Hand visibility', 0, {min:0, max:1, id: 'progressbar-lefthand'});
        inspector.addProgress('Right Hand visibility', 0, {min:0, max:1, id: 'progressbar-righthand'});
        
        inspector.branch("Blendshapes weights");
        inspector = this.createBlendShapesInspector(this.editor.mapNames, {inspector: inspector});
        inspector.root.style.maxHeight = "calc(100% - 57px)";
        inspector.root.style.overflowY = "scroll";
        inspector.root.style.flexWrap = "wrap";
        this.bsInspector = inspector;
        captureArea.appendChild(i);
        captureArea.appendChild(this.bsInspector.root)

        // Create bottom buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.id = "capture-buttons";
        buttonContainer.style.display = "flex";
        buttonContainer.style.padding = "10px";
        buttonContainer.style.minHeight =  "84px";
        const buttons = [
            {
                id: "capture_btn",
                text: " <i class='bi bi-record-circle' style= 'margin:5px; font-size:initial;'></i> Start recording"
            },
            {
                id: "trim_btn",
                text: "Convert to animation",
                display: "none",
                callback: () => VideoUtils.unbind( (start, end) => window.globals.app.onRecordLandmarks(start, end) )
            },
            {
                id: "redo_btn",
                text: " <i class='fa fa-redo'></i>",
                title: "Redo video",
                display: "none",
                callback: async () => {
                    
                    window.location.reload();
                }
            }
        ];

        for(let b of buttons) {
            const button = document.createElement("button");
            button.id = b.id;
            button.title = b.title || "";
            button.style.display = b.display || "block";
            button.innerHTML = b.text;
            button.classList.add("btn-primary", "captureButton");
            if(b.styles) Object.assign(button.style, b.styles);
            if(b.callback) button.addEventListener('click', b.callback);
            buttonContainer.appendChild(button);
        }
        captureArea.appendChild(buttonContainer);
        videoArea.appendChild(buttonContainer);

    }

    createBlendShapesInspector(bsNames, options = {}) {
        
        let inspector = options.inspector || new LX.Panel({id:"blendshapes-inspector"});
        
        if(options.clear)
            inspector.clear();
            
        if(inspector.id)
            inspector.addTitle(inspector.id);

        for(let name in bsNames) {
    
            inspector.addProgress(name, 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, editable: options.editable, showNumber: options.showNumber, callback: (v,e) => this.editor.updateBlendshapesProperties(name, v), signal: "@on_change_" + name});
        }
        
        return inspector;
    }
  

    /** Create timelines */
    createTimelines( area ) {

        this.keyFramesTimeline = new LX.KeyFramesTimeline("Bones");
        this.keyFramesTimeline.setFramerate(30);
        // this.keyFramesTimeline.setScale(400);

        this.curvesTimeline = new LX.CurvesTimeline("Action Units");
        this.curvesTimeline.setFramerate(30);
        this.curvesTimeline.onSetTime = (t) => this.editor.setTime( Math.clamp(t, 0, this.editor.auAnimation.duration - 0.001) );
        this.curvesTimeline.onUpdateTrack = (idx) => this.editor.updateAnimationAction(this.curvesTimeline.animationClip, idx);
        this.curvesTimeline.onDeleteKeyFrame = (trackIdx, tidx) => this.editor.removeAnimationData(this.curvesTimeline.animationClip, trackIdx, tidx);
        this.curvesTimeline.onGetSelectedItem = () => { return this.editor.getSelectedActionUnit(); };

        this.timelineArea.attach(this.keyFramesTimeline.root);
        this.timelineArea.attach(this.curvesTimeline.root);
        this.keyFramesTimeline.hide();
        this.curvesTimeline.hide();

    }
    
    initEditionGUI() {
        // Hide capture buttons
        let buttonContainer = document.getElementById("capture-buttons");
        buttonContainer.style.display = "none";
    
        // Reposition video the canvas elements
        let videoDiv = document.getElementById("capture");
        videoDiv.classList.remove("expanded");
        let videoRec = document.getElementById("recording");
        videoRec.classList.remove("hidden");
        videoRec.style.width = "100%";
        videoRec.style.height = "100%";
        
        // Mirror the video
        videoRec.style.cssText+= "transform: rotateY(0deg);\
        -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
        -moz-transform:rotateY(0deg); /* Firefox */"
    
        let videoCanvas = document.getElementById("outputVideo");
        videoCanvas.classList.remove("border-animation");
        
        // Resize and solve the aspect ratio problem of the video
        let aspectRatio = videoCanvas.clientWidth / videoCanvas.clientHeight;
        videoRec.width  = videoDiv.width = videoDiv.width || videoDiv.clientWidth;
        videoRec.height = videoDiv.height = videoDiv.width / aspectRatio;
        videoDiv.style.width = videoDiv.width  + "px";
        videoDiv.style.height = videoDiv.height + "px";
        videoCanvas.height = 300;
        videoCanvas.width = 300 * aspectRatio;
        $(videoDiv).draggable({containment: "#canvasarea"}).resizable({ aspectRatio: true, containment: "#outputVideo"});
    }
    
    changeCaptureGUIVisivility(hidde) {
        this.bsInspector.root.hidden = hidde || !this.bsInspector.root.hidden;
    }

    updateCaptureGUI(results, isRecording) {
        
        let {landmarksResults, blendshapesResults} = results;
        if(isRecording){
            this.changeCaptureGUIVisivility(true);
            return;
        }
        else {
            //document.getElementById("capture-info").classList.remove("hidden");
        }
        if(landmarksResults && landmarksResults.poseLandmarks) {

            const { poseLandmarks } = landmarksResults;
            
            let distance = (poseLandmarks[23].visibility + poseLandmarks[24].visibility)*0.5;
            let leftHand = (poseLandmarks[15].visibility + poseLandmarks[17].visibility + poseLandmarks[19].visibility)/3;
            let rightHand = (poseLandmarks[16].visibility + poseLandmarks[18].visibility + poseLandmarks[20].visibility)/3;
        
            this.bsInspector.get('Distance to the camera').onSetValue(distance);
            this.bsInspector.get('Left Hand visibility').onSetValue(leftHand);
            this.bsInspector.get('Right Hand visibility').onSetValue(rightHand);
            
       
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
            
            }
        }
    }

    hideCaptureArea() {
        let selector = document.getElementById("select-mode");
        selector.style.display = "none";

        let e = document.getElementById("video-area");
        e.classList.remove("video-area");
        
        let i = document.getElementById("expand-capture-gui");
        i.classList.add("hidden");

        let ci = document.getElementById("capture-inspector");
        ci.classList.add("hidden");

        // this.hideTimeline();
        // this.timelineArea.hide();        
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {
  
        
        let area = new LX.Area({className: "sidePanel", id: 'panel', scroll: true});  
        this.sidePanel.attach(area);
       
        let [top, bottom] = area.split({type: "vertical", resize: false, sizes: "auto"});
        // let [top, bottom] = area.sections;
        this.animationPanel = new LX.Panel({id:"animaiton"});
        top.attach(this.animationPanel);
        this.updateAnimationPanel( );

        //create tabs
        let tabs = bottom.addTabs({fit: true});

        let bodyArea = new LX.Area({className: "sidePanel", id: 'Body', scroll: true});  
        let faceArea = new LX.Area({className: "sidePanel", id: 'Face', scroll: true});  
        tabs.add( "Body", bodyArea, {selected: true, onSelect: (e,v) => {this.editor.setAnimation(v)}}  );
        if(this.editor.auAnimation) {

            tabs.add( "Face", faceArea, {onSelect: (e,v) => {
                this.editor.setAnimation(v); 
                this.updateActionUnitsPanel(this.editor.getSelectedActionUnit());
                this.imageMap.resize();
            } });
    
            faceArea.split({type: "vertical", sizes: ["50%", "50%"]});
            let [faceTop, faceBottom] = faceArea.sections;
            this.createFacePanel(faceTop);
            this.createActionUnitsPanel(faceBottom);
        }

        bodyArea.split({type: "vertical", resize: false, sizes: "auto"});
        let [bodyTop, bodyBottom] = bodyArea.sections;
        this.createSkeletonPanel( bodyTop, 'root', {firstBone: true} );
        this.createBonePanel( bodyBottom );
        
    }

    updateAnimationPanel( options = {}) {
        let widgets = this.animationPanel;

        widgets.onRefresh = (o) => {

            o = o || {};
            widgets.clear();
            widgets.addTitle("Animation");
            widgets.addText("Name", this.editor.clipName || "", (v) => this.editor.clipName = v)
            widgets.addNumber("Speed", this.editor.mixer.timeScale, v => {
                this.editor.mixer.timeScale = v;
            }, {min: 0.25, max: 1.5, step: 0.05, precision: 2});
            widgets.addSeparator();
        }
        widgets.onRefresh(options);
    }

    createFacePanel(root, itemSelected, options = {}) {

        let container = document.createElement("div");
        
        let img = document.createElement("img");
        img.src = "./data/imgs/masks/face areas2.png";
        img.setAttribute("usemap", "#areasmap");
        img.style.position = "relative";
        container.appendChild(img);
        
        
        let map = document.createElement("map");
        map.name = "areasmap";

        let div = document.createElement("div");
        div.style.position = "fixed";
        let mapHovers = document.createElement("div");
        for(let area in this.faceAreas) {
            let maparea = document.createElement("area");
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
        root.root.appendChild(container);
        container.appendChild(map);
        
        container.style.height = "100%";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        
        map.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.updateActionUnitsPanel(e.target.name);
           
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
                var n, m, clen,
                    x = root.root.clientHeight / previousHeight;
                for (n = 0; n < len; n++) {
                    clen = coords[n].length;
                    for (m = 0; m < clen; m++) {
                        coords[n][m] *= x;
                    }
                    areas[n].coords = coords[n].join(',');
                }
                previousWidth = previousWidth*x;
                previousHeight = root.root.clientHeight;
                this.highlighter.element.parentElement.querySelector("canvas").width = previousWidth;
                this.highlighter.element.parentElement.querySelector("canvas").height = previousHeight;
                this.highlighter.element.parentElement.style.width = previousWidth + "px";
                this.highlighter.element.parentElement.style.height = previousHeight + "px";
                return true;
            };
            root.onresize = this.resize;
        }

    }

    createActionUnitsPanel(root) {
        
        let tabs = root.addTabs({fit:true});
        let areas = {};
        
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
            panel = this.createBlendShapesInspector(areas[area], {inspector: panel, editable: true, showNumber:true});
            tabs.add(area, panel, { selected: this.editor.getSelectedActionUnit() == area, onSelect : (e, v) => {
                this.showTimeline();
                this.editor.setSelectedActionUnit(v);
                document.getElementsByClassName("map-container")[0].style.backgroundImage ="url('" +"./data/imgs/masks/face areas2 " + v + ".png"+"')";
            }
            });
        }
        this.facePanel = tabs;

    }

    updateActionUnitsPanel(area) {
        this.facePanel.root.querySelector("[data-name='"+area+"']").click();
    }

    createSkeletonPanel(root, itemSelected = this.itemSelected, options) {

        let skeletonPanel = new LX.Panel({id:"skeleton"});
        root.attach(skeletonPanel);

        options = options || {};
        this.boneProperties = {};
        this.itemSelected = itemSelected;
        
        var mytree = this.updateNodeTree();
    
        let litetree = skeletonPanel.addTree("Skeleton bones", mytree, { 
            // icons: tree_icons, 
            filter: true,
            onevent: (event) => { 
                console.log(event.string());
    
                switch(event.type) {
                    case LX.TreeEvent.NODE_SELECTED: 
                        if(event.multiple)
                            console.log("Selected: ", event.node); 
                        else {
                            itemSelected = event.node.id;
                            this.updateSkeletonPanel({itemSelected: itemSelected});
                
                            if(!this.editor)
                                throw("No editor attached");
                
                            this.editor.setSelectedBone( itemSelected );

                            this.editor.activeTimeline = this.keyFramesTimeline;
                            this.keyFramesTimeline.setSelectedItems( [itemSelected] );
                            this.showTimeline();
                            
                            console.log(itemSelected + " selected"); 
                        }
                        break;
                    case LX.TreeEvent.NODE_DBLCLICKED: 
                        console.log(event.node.id + " dbl clicked"); 
                        break;
                    case LX.TreeEvent.NODE_CONTEXTMENU: 
                        LX.addContextMenu( event.multiple ? "Selected Nodes" : event.node.id, event.value, m => {
    
                            // {options}: callback, color
    
                            m.add( "Move before sibling" );
                            m.add( "Move after sibling" );
                            m.add( "Move to parent" );
                            
                        });
                        break;
                    case LX.TreeEvent.NODE_DRAGGED: 
                        console.log(event.node.id + " is now child of " + event.value.id); 
                        break;
                    case LX.TreeEvent.NODE_RENAMED:
                        console.log(event.node.id + " is now called " + event.value); 
                        break;
                    case LX.TreeEvent.NODE_VISIBILITY:
                        console.log(event.node.id + " visibility: " + event.value); 
                        break;
                }
            },
        });
   
        this.tree = litetree;
    }

    updateNodeTree() {
        
        const rootBone = this.editor.skeletonHelper.bones[0];
        
        let mytree = { 'id': rootBone.name };
        let children = [];
        
        const addChildren = (bone, array) => {
            
            for( let b of bone.children ) {
                
                if ( ! b.isBone ){ continue; }
                let child = {
                    id: b.name,
                    children: [],
                    closed: true
                }
                
                array.push( child );
                
                addChildren(b, child.children);
            }
        };
        
        addChildren(rootBone, children);
        
        mytree['children'] = children;
        return mytree;
    }

    createBonePanel(root, itemSelected = this.itemSelected, options) {

        let bonePanel = new LX.Panel({id:"bone"});
        root.attach(bonePanel);
        // Editor widgets 
        this.bonePanel = bonePanel;
      
        this.updateSkeletonPanel(options);

        // // update scroll position
        // var element = root.content.querySelectorAll(".inspector")[0];
        // var maxScroll = element.scrollHeight;
        // element.scrollTop = options.maxScroll ? maxScroll : (options.scroll ? options.scroll : 0);
    }

    updateSkeletonPanel(options = {}) {

       
        let widgets = this.bonePanel;

        widgets.onRefresh = (o) => {

            o = o || {};
            widgets.clear();

            const boneSelected = !(o.firstBone && numBones) ? //change to get values of animation?
                this.editor.skeletonHelper.getBoneByName(o.itemSelected) : 
                this.editor.skeletonHelper.bones[0];

            if(boneSelected) {

                let disabled = false;
                if(this.editor.mode == this.editor.eModes.NMF)
                    disabled = true;
                 
                const numTracks = this.keyFramesTimeline.getNumTracks(boneSelected);
                let active = this.editor.getGizmoMode();
                if(!disabled) {

                    const toolsValues = [ {value:"Joint", callback: (v,e) => this.editor.setGizmoTool(v)}, {value:"Follow", callback: (v,e) => this.editor.setGizmoTool(v)}] ;
                    const _Tools = this.editor.hasGizmoSelectedBoneIk() ? toolsValues : [toolsValues[0]];
                    
                    widgets.branch("Gizmo", { icon:"fa-solid fa-chart-scatter-3d", settings: (e) => this.openSettings( 'gizmo' ), settings_title: "<i class='bi bi-gear-fill section-settings'></i>" });
                    
                    widgets.addComboButtons( "Tool", _Tools, {selected: this.editor.getGizmoTool(), nameWidth: "50%", width: "100%"});
                    
                    if( this.editor.getGizmoTool() == "Joint" ){
                        const modesValues = [{value:"Translate", callback: (v,e) => {this.editor.setGizmoMode(v); widgets.onRefresh(options);}}, {value:"Rotate", callback: (v,e) => {this.editor.setGizmoMode(v); widgets.onRefresh(options);}}, {value:"Scale", callback: (v,e) => {this.editor.setGizmoMode(v); widgets.onRefresh(options);}}];
                        const _Modes = numTracks > 1 ? modesValues : [modesValues[1]];
                        if( numTracks <= 1 ){ this.editor.setGizmoMode("Rotate"); }
                        widgets.addComboButtons( "Mode", _Modes, { selected: this.editor.getGizmoMode(), nameWidth: "50%", width: "100%"});
                    }

                    const _Spaces = [{value: "Local", callback: (v,e) =>  this.editor.setGizmoSpace(v)}, {value: "World", callback: (v,e) =>  this.editor.setGizmoSpace(v)}]
                    widgets.addComboButtons( "Space", _Spaces, { selected: this.editor.getGizmoSpace(), nameWidth: "50%", width: "100%"});
    
                    widgets.addCheckbox( "Snap", this.editor.isGizmoSnapActive(), () => this.editor.toggleGizmoSnap() );
    
                    widgets.addSeparator();
                }    

                const innerUpdate = (attribute, value) => {
            
                    boneSelected[attribute].fromArray( value ); 
                    if(attribute == 'quaternion') {
                        boneSelected[attribute].normalize();
                        widgets.widgets['Quaternion'].setValue(boneSelected[attribute].toArray());
                        widgets.widgets['Rotation (XYZ)'].setValue(boneSelected['rotation'].toArray());
                    }
                    if(attribute == 'rotation') {
                        widgets.widgets['Quaternion'].setValue(boneSelected['quaternion'].toArray());
                    }
                    this.editor.gizmo.onGUI(attribute);
                };


                widgets.branch("Bone", { icon: "fa-solid fa-bone" });
                widgets.addText("Name", boneSelected.name, null, {disabled: true});
                widgets.addText("Num tracks", numTracks ?? 0, null, {disabled: true});

                // Only edit position for root bone
                if(boneSelected.children.length && boneSelected.parent.constructor !== boneSelected.children[0].constructor) {
                    this.boneProperties['position'] = boneSelected.position;
                    widgets.addVector3('Position', boneSelected.position.toArray(), (v) => innerUpdate("position", v), {disabled: this.editor.state || disabled || active != 'Translate', precision: 3, className: 'bone-position'});

                    this.boneProperties['scale'] = boneSelected.scale;
                    widgets.addVector3('Scale', boneSelected.scale.toArray(), (v) => innerUpdate("scale", v), {disabled: this.editor.state || disabled || active != 'Scale', precision: 3, className: 'bone-scale'});
                }

                this.boneProperties['rotation'] = boneSelected.rotation;
                widgets.addVector3('Rotation (XYZ)', boneSelected.rotation.toArray(), (v) => {innerUpdate("rotation", v), widgets.onRefresh(options)}, {disabled: this.editor.state || disabled || active != 'Rotate', precision: 3, className: 'bone-euler'});

                this.boneProperties['quaternion'] = boneSelected.quaternion;
                widgets.addVector4('Quaternion', boneSelected.quaternion.toArray(), (v) => {innerUpdate("quaternion", v)}, {disabled: this.editor.state || disabled || active != 'Rotate', precision: 3, className: 'bone-quaternion'});
            }

        };

        widgets.onRefresh(options);
    }
    /** ------------------------------------------------------------ */

    loadKeyframeClip( clip, callback ) {

        this.hideCaptureArea();
        
        this.clip = clip || { duration: 1};
        this.duration =  this.clip.duration;

        let boneName = null;
        if(this.editor.skeletonHelper.bones.length) {
            boneName = this.editor.skeletonHelper.bones[0].name;
        }

        let tracks = [];
        for(let i = 0; i < this.clip.tracks.length; i++) {
            if(this.clip.tracks[i].name.includes("position") && i > 0)
                continue;
            tracks.push(this.clip.tracks[i]);
        }
        this.clip.tracks = tracks;
        // this.timeline = new KeyFramesTimeline( this.editor.bodyAnimation, boneName);
        // this.keyFramesTimeline.show();
        this.keyFramesTimeline.setAnimationClip(this.clip);
        this.keyFramesTimeline.setSelectedItems([boneName]);
        // this.keyFramesTimeline.resize([this.keyFramesTimeline.canvas.parentElement.clientWidth, this.keyFramesTimeline.canvas.parentElement.clientHeight]);
        this.keyFramesTimeline.onSetTime = (t) => this.editor.setTime( Math.clamp(t, 0, this.editor.bodyAnimation.duration - 0.001) );
        this.keyFramesTimeline.onSetDuration = (t) => {this.duration = this.keyFramesTimeline.duration = this.clip.duration = this.editor.bodyAnimation.duration = t};
        this.keyFramesTimeline.onDeleteKeyFrame = (trackIdx, tidx) => this.editor.removeAnimationData(this.keyFramesTimeline.animationClip, trackIdx, tidx);

        this.keyFramesTimeline.onSelectKeyFrame = (e, info, index) => {
            if(e.button != 2) {
                //this.editor.gizmo.mustUpdate = true
                this.editor.gizmo.update(true);
                this.updateSkeletonPanel({itemSelected:info[0]});

                return false;
            }

            // Change gizmo mode and dont handle
            // return false;

            this.showKeyFrameOptions(e, info, index);

            return true; // Handled
        };
        var that = this;
        this.keyFramesTimeline.showContextMenu = function ( e ) {
            
            e.preventDefault();
            e.stopPropagation();

            let actions = [];
            //let track = this.NMFtimeline.clip.tracks[0];
            if(this.lastKeyFramesSelected && this.lastKeyFramesSelected.length) {
                if(this.lastKeyFramesSelected.length == 1 && this.clipboard && this.clipboard.value)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => {
                                let [id, trackIdx, keyIdx] = this.lastKeyFramesSelected[0];
                                    this.pasteKeyFrameValue(e, this.tracksPerItem[id][trackIdx], keyIdx);
                            }
                        }
                    )
                }
                actions.push(
                    {
                        title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => {
                            let toCopy = {};
                            for(let i = 0; i < this.lastKeyFramesSelected.length; i++){
                                let [id, trackIdx, keyIdx] = this.lastKeyFramesSelected[i];
                                if(toCopy[this.tracksPerItem[id][trackIdx].clipIdx]) {
                                    toCopy[this.tracksPerItem[id][trackIdx].clipIdx].idxs.push(keyIdx);
                                } else {
                                    toCopy[this.tracksPerItem[id][trackIdx].clipIdx] = {idxs : [keyIdx]};
                                    toCopy[this.tracksPerItem[id][trackIdx].clipIdx].track = this.tracksPerItem[id][trackIdx]
                                }                
                                if(i == 0) {
                                    this.copyKeyFrameValue(this.tracksPerItem[id][trackIdx], keyIdx)
                                }
                            }
                            for(let clipIdx in toCopy) {
                                
                                this.copyKeyFrames(toCopy[clipIdx].track, toCopy[clipIdx].idxs)
                            }
                           
                        }
                    }
                )
                actions.push(
                    {
                        title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                        callback: () => {
                            let keyframesToDelete = this.lastKeyFramesSelected;
                            e.multipleSelection = keyframesToDelete.length > 1 ?? false;
                            for(let i = 0; i < keyframesToDelete.length; i++){
                                this.deleteKeyFrame(e, keyframesToDelete[i][1], keyframesToDelete[i][2]);
                            }
                            // that.editor.optimizeTracks(this.animationClip.tracks);
                        }
                    }
                )
            }
            else{
                let [name, type] = [e.track.name, e.track.type]
                if(that.boneProperties[type]) {
                    
                    actions.push(
                        {
                            title: "Add",
                            callback: () => this.addKeyFrame( e.track, that.boneProperties[type].toArray() )
                        }
                    )
                }

                if(this.clipboard && this.clipboard.keyframes)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => {
                                let currentTime = this.currentTime;
                                for(let clipIdx in this.clipboard.keyframes) {
                                    let indices = Object.keys( this.clipboard.keyframes[clipIdx].values)
                                    this.pasteKeyFrames(e, clipIdx, indices);
                                    this.currentTime = currentTime;
                                }
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
        this.keyFramesTimeline.onGetOptimizeThreshold = () => { return this.editor.optimizeThreshold; }
        this.keyFramesTimeline.onChangeTrackVisibility = (e, t, n) => {this.editor.updateAnimationAction(this.keyFramesTimeline.animationClip, null, true)}
        this.keyFramesTimeline.optimizeTrack = (idx) => {this.editor.optimizeTrack(idx);}
        this.keyFramesTimeline.onOptimizeTracks = (idx = null) => { this.editor.updateActionUnitsPanel(this.keyFramesTimeline.animationClip, idx)}
        this.editor.activeTimeline = this.keyFramesTimeline;
        // this.hideTimeline();
        if(callback)
            callback();
    }

}

class ScriptGui extends Gui {

    constructor(editor) {
        
        super(editor);

    }

    /** Create timelines */
    createTimelines( area ) {

        this.clipsTimeline = new LX.ClipsTimeline("Behaviour actions", {trackHeight: 30});
        this.clipsTimeline.setFramerate(30);
        // this.clipsTimeline.setScale(400);
        // this.clipsTimeline.hide();
        this.clipsTimeline.addButtons([
            {
                name: 'Animation loop',
                property: 'animLoop',
                selectable: true,
                selected: this.editor.animLoop,
                width: '40px',
                icon: 'fa-solid fa-person-walking-arrow-loop-left',
                callback: (v) =>  {
                    this.editor.animLoop = !this.editor.animLoop;
                    this.editor.setAnimationLoop(this.editor.animLoop);
                    
                }
            },
            {
                name: 'Clear all tracks',
                property: 'clearTracks',
                width: '40px',
                icon: 'fa-solid fa-trash',
                callback: (v) =>  {
                    this.editor.clearAllTracks()     
                }
            }
        ])
        this.timelineArea.attach(this.clipsTimeline.root);
        this.clipsTimeline.canvas.tabIndex = 1;
    }
    
    async dataToBMLClips(data, callback, breakdown = true) {

        let clips = [];
        let globalStart = 10000;
        let globalEnd = -10000;
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

                    }
                }
                else {
                    clipClass = ANIM.clipTypes[data.indices[i]];
                }

                if(!clipClass)
                    continue;

                globalStart = Math.min(globalStart, data.behaviours[i].start >= 0 ? data.behaviours[i].start : globalStart);
                globalEnd = Math.max(globalEnd, data.behaviours[i].end || globalEnd);
                
                if(breakdown)
                    clips.push(new clipClass( data.behaviours[i]));
                else
                    clips.push(new clipClass( data.behaviours[i]));
                
            }
        }
        return {clips: clips, duration: globalEnd - globalStart}
    }
    async loadBMLClip(clip, callback, breakdown = true) { 
        
        let {clips, duration} = await this.dataToBMLClips(clip, callback, breakdown);

        if(!breakdown) {
            this.clipsTimeline.addClip(new ANIM.SuperClip( {duration: duration, type: "glossa", id: clip.name, clips}));
        }
        else {
            this.clipsTimeline.addClips(clips);
        }
        this.clip = this.clipsTimeline.animationClip || clip ;
        this.duration = this.clip.duration || duration;

        this.clipsTimeline.onSetTime = (t) => this.editor.setTime( Math.clamp(t, 0, this.editor.animation.duration - 0.001) );
        this.clipsTimeline.onSelectClip = this.updateClipPanel.bind(this);

        this.clipsTimeline.onContentMoved = (clip, offset)=> {
           if(clip.strokeStart) clip.strokeStart+=offset;
           if(clip.stroke) clip.stroke+=offset;
           if(clip.strokeEnd) clip.strokeEnd+=offset;
           this.updateClipPanel(clip);
           this.editor.gizmo.updateTracks();
           this.clipsTimeline.onSetTime(this.clipsTimeline.currentTime);
        };

        this.clipsTimeline.deleteContent = () => {
            let clipstToDelete = this.clipsTimeline.lastClipsSelected;
            for(let i = 0; i < clipstToDelete.length; i++){
                this.clipsTimeline.deleteClip({}, clipstToDelete[i], null);
            }
            this.editor.gizmo.updateTracks();
            this.updateClipPanel();
        }

        this.clipsTimeline.copyContent = () => {
            this.clipsTimeline.clipsToCopy = [...this.clipsTimeline.lastClipsSelected];
        }

        this.clipsTimeline.pasteContent = () => {
            if(!this.clipsTimeline.clipsToCopy)
                return;
            this.clipsTimeline.clipsToCopy.sort((a,b) => {
                if(a[0]<b[0]) 
                    return -1;
                return 1;
            });

            this.clipsTimeline.unSelectAllClips();
            let offset = 0;
            let clips = [];
            let globalStart = 1000;
            for(let i = 0; i < this.clipsTimeline.clipsToCopy.length; i++){
                let [trackIdx, clipIdx] = this.clipsTimeline.clipsToCopy[i];
                let clipToCopy = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                clipToCopy.end = null;
                if(clipToCopy.attackPeak!=undefined) clipToCopy.attackPeak = clipToCopy.fadein;
                if(clipToCopy.ready!=undefined) clipToCopy.ready = clipToCopy.fadein;
                if(clipToCopy.strokeStart!=undefined) clipToCopy.strokeStart = clipToCopy.fadein;
                if(clipToCopy.relax!=undefined) clipToCopy.relax = clipToCopy.fadeout;
                if(clipToCopy.strokeEnd!=undefined) clipToCopy.strokeEnd = clipToCopy.fadeout;
                
                let newClip = new ANIM[clipToCopy.constructor.name](clipToCopy);
                clips.push(newClip); 
                globalStart = Math.min(newClip.start, globalStart);
            }
            for(let i = 0; i < clips.length; i++){
                
                
                offset = clips[i].start - globalStart;
                
                if(clips[i].attackPeak) clips[i].fadein = clips[i].attackPeak -= globalStart;
                if(clips[i].relax) clips[i].fadeout = clips[i].relax -= globalStart;
                if(clips[i].ready) clips[i].fadein = clips[i].ready -= globalStart;
                if(clips[i].strokeStart) clips[i].strokeStart -= globalStart;
                if(clips[i].stroke) clips[i].stroke -= globalStart;
                if(clips[i].strokeEnd) clips[i].strokeEnd -= globalStart;
                clips[i].start = offset;
            }
            this.clipsTimeline.addClips(clips);
            this.clipsTimeline.clipsToCopy = null;
        }
        // this.clipsTimeline.onUpdateTrack = (idx) 
        this.clipsTimeline.showContextMenu = ( e ) => {

            e.preventDefault();
            e.stopPropagation();

            let actions = [];
            //let track = this.NMFtimeline.clip.tracks[0];
            if(this.clipsTimeline.lastClipsSelected.length) {
                actions.push(
                    {
                        title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => this.clipsTimeline.copyContent()
                    }
                )
                actions.push(
                    {
                        title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                        callback: () => this.clipsTimeline.deleteContent()
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
                            this.createNewPresetDialog(this.clipsTimeline.lastClipsSelected);
                        }
                    }
                )

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
                                this.createNewSignDialog(this.clipsTimeline.lastClipsSelected, "server");
                            
                            
                        }
                    }
                )
            }
            else{
                actions.push(
                    {
                        title: "Add clip",
                        callback: this.createClipsDialog.bind(this)
                    },
                    {
                        title: "Add preset",
                        callback: this.createPresetsDialog.bind(this)
                    },
                    {
                        title: "Add sign",
                        callback: this.createSignsDialog.bind(this)
                    }
                );
                
                if(this.clipsTimeline.clipsToCopy)
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

        if(callback)
            await callback();
    }

    init() {
        this.createSidePanel();
        this.updateMenubar();
        if(this.duration <= 0)
            this.showGuide();
        this.showTimeline();
        // Canvas UI buttons
        this.createSceneUI(this.canvasArea);
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {

        // let area = new LX.Area({className: "sidePanel", id: 'panel', scroll: true});  
        // this.sidePanel.attach(area);
       
        let [top, bottom] = this.sidePanel.split({type: "vertical", resize: false, sizes: "auto"});
        // let [top, bottom] = area.sections;
        this.animationPanel = new LX.Panel({id:"animaiton"});
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
            widgets.addText("Name", this.editor.clipName || "", (v) => this.editor.clipName = v)
            widgets.addNumber("Speed", this.editor.mixer.timeScale, v => {
                this.editor.mixer.timeScale = v;
            }, {min: 0.25, max: 1.5, step: 0.05, precision: 2});
            widgets.addSeparator();
            widgets.addComboButtons("Dominant hand", [{value: "Left", callback: (v) => this.editor.dominantHand = v}, {value:"Right", callback: (v) => this.editor.dominantHand = v}], {selected: this.editor.dominantHand})
            widgets.addButton(null, "Add clip", () => this.createClipsDialog(), {title: "CTRL+K"} )
            widgets.addButton(null, "Add preset", () => this.createPresetsDialog(), {title: "CTRL+P"} )
            widgets.addButton(null, "Add sign", () => this.createSignsDialog(), {title: "CTRL+L"} )
            widgets.addSeparator();
        }
        widgets.onRefresh(options);
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
                    widgets.addButton(null, "Create preset", (v, e) => this.createNewPresetDialog());
                }
                return;
            }
            
            this.clipInPanel = clip;
            const updateTracks = (refreshPanel) => {
                if(!clip)
                    return;

                if(clip && clip.start + clip.duration > this.clipsTimeline.duration) {
                    this.clipsTimeline.setDuration(clip.start + clip.duration);
                }
                this.editor.gizmo.updateTracks(); 
                this.editor.setTime(this.clipsTimeline.currentTime);
                               
                if(this.curve) {
                    let syncvalues = [];
                    // syncvalues.push([clip.start, 0]);

                    if(clip.fadein != undefined)
                        syncvalues.push([clip.fadein - clip.start, (clip.properties.amount || 1) - 0.2]);
                    
                    if(clip.fadeout != undefined) 
                        syncvalues.push([clip.fadeout - clip.start, (clip.properties.amount || 1) - 0.2]);
                    
                    // syncvalues.push([clip.duration + clip.start, 0]);
                    // this.curve.curve_instance.element.value = syncvalues;
                    // this.curve.curve_instance.element.xrange = [0, clip.duration];
                    
                    this.curve.curve_instance.redraw({value: syncvalues, xrange: [0, clip.duration]})
                }
                if(refreshPanel)
                    this.updateClipPanel(clip);
            }

            widgets.widgets_per_row = 1;
            // this.clipPanel.branch(clip.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g).join(" "));

            let icon = "fa-solid fa-child-reaching";

            if(clip.constructor.name.includes("Face")) 
                icon = "fa-solid fa-face-smile"
            else if(clip.constructor.name.includes("Mouthing")) 
                icon = "fa-solid fa-comment-dots";
            else if(clip.constructor.name.includes("Head"))
                icon = "fa-solid fa-user-large";
            else if(clip.constructor.name.includes("Gaze"))
                icon = "fa-solid fa-eye";
            else if(clip.constructor.name.includes("Super")) 
                icon = "fa-solid fa-clapperboard";

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
                                    updateTracks(true);
                                    // this.updateClipPanel(clip);
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
            widgets.branch("Time", {icon: "fa-solid fa-clock"});
            
            widgets.addNumber("Start", clip.start.toFixed(2), (v) =>
            {     
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
                    clip.onChangeStart(v);
                }
                updateTracks(true);
                // this.updateClipPanel(clip);
                
            }, {min:0, step:0.01, precision:2});

            widgets.addNumber("Duration", clip.duration.toFixed(2), (v) =>
            {
                const diff = v - clip.duration;
                clip.duration = v;
                this.clipInPanel.duration = v;
                const end = v + clip.start;
                if(clip.relax != undefined)
                    clip.relax = clip.fadeout = clip.fadeout + diff > end ? end : clip.fadeout + diff;
                if(clip.strokeEnd != undefined) 
                    clip.strokeEnd = clip.strokeEnd + diff > clip.relax ? clip.relax : clip.strokeEnd + diff;
                if(clip.stroke != undefined) 
                    clip.stroke = clip.stroke > clip.strokeEnd ? clip.strokeEnd : clip.stroke;
                if(clip.strokeStart != undefined) 
                    clip.strokeStart = clip.strokeStart > clip.stroke ? clip.stroke : clip.strokeStart;

                if(clip.attackPeak != undefined)  
                    clip.attackPeak = clip.fadein = Math.clamp(clip.fadein, clip.start, clip.relax);
                if(clip.ready != undefined)  
                    clip.ready = clip.fadein =  Math.clamp(clip.fadein, clip.start, clip.relax);
                
               
                updateTracks(true);
                // this.updateClipPanel(clip);
            }, {min:0.01, step:0.01, precision:2, disabled: clip.type == "custom"});

            if(clip.fadein!= undefined && clip.fadeout!= undefined)  {
                widgets.merge();
                widgets.branch("Sync points", {icon: "fa-solid fa-chart-line"});
                widgets.addText(null, "These sync points define the dynamic progress of the action. They are normalized by duration.", null, {disabled: true});
                const syncvalues = [];
                
                if(clip.fadein != undefined)
                {
                    syncvalues.push([clip.fadein - clip.start, (clip.properties.amount || 1) - 0.2]);
                    if(clip.attackPeak != undefined)
                        // clip.attackPeak = clip.fadein = Math.clamp(clip.start, clip.relax);
                        widgets.addNumber("Attack Peak (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.attackPeak = clip.fadein = v + clip.start;
                            updateTracks();
                        }, {min:0, max: clip.fadeout - clip.start, step:0.01, precision:2, title: "Maximum action achieved"});
                    
                    if(clip.ready != undefined)
                        widgets.addNumber("Ready (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.ready = clip.fadein = v + clip.start;
                            updateTracks(true);
                        }, {min:0, max: clip.fadeout - clip.start, step:0.01, precision:2, title: "Target acquired or end of the preparation phase"});
                }

                if(clip.strokeStart != undefined) {

                    // clip.strokeStart = Math.clamp(clip.strokeStart, clip.ready, clip.stroke);
                    widgets.addNumber("Stroke start (s)", (clip.strokeStart - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeStart = v + clip.start;
                        updateTracks(true);
                    }, {min: clip.ready - clip.start, max: clip.stroke - clip.start, step:0.01, precision:2, title: "Start of the stroke"});
                }

                if(clip.stroke != undefined) {
                    // clip.stroke = Math.clamp(clip.stroke, clip.strokeStart, clip.strokeEnd);
                    
                    widgets.addNumber("Stroke (s)", (clip.stroke - clip.start).toFixed(2), (v) =>
                    {              
                        clip.stroke = v + clip.start;
                        updateTracks(true);
                        // this.updateClipPanel(clip);

                    }, {min: clip.strokeStart - clip.start, max: clip.strokeEnd - clip.start, step:0.01, precision:2, title: "Stroke of the motion"});
                }

                if(clip.strokeEnd != undefined) {
                    // clip.strokeEnd = Math.clamp(clip.strokeEnd, clip.stroke, clip.relax); 

                    widgets.addNumber("Stroke end (s)", (clip.strokeEnd - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeEnd = v + clip.start;
                        updateTracks(true);
                        // this.updateClipPanel(clip);

                    }, {min: clip.stroke - clip.start, max: clip.relax - clip.start, step:0.01, precision:2, title: "End of the stroke"});
                }


                if(clip.fadeout != undefined) 
                {
                    syncvalues.push([clip.fadeout - clip.start, (clip.properties.amount || 1) - 0.2]);
                    
                    if(clip.relax != undefined)
                        // clip.relax = clip.fadeout = Math.clamp(clip.relax, clip.strokeEnd, clip.start + clip.duration); 
                        widgets.addNumber("Relax (s)", (clip.fadeout - clip.start).toFixed(2), (v) =>
                        {              
                            clip.relax = clip.fadeout = v + clip.start;
                            if(clip.attackPeak != undefined)
                                clip.attackPeak = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);

                            if(clip.ready != undefined)
                                clip.ready = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);
                            updateTracks();
                        }, {min: clip.fadein - clip.start, max: clip.duration , step:0.01, precision:2, title: "Decay or retraction phase starts"});
                }

                if(syncvalues.length) {
                   
                    this.curve = widgets.addCurve("Synchronization", syncvalues, (value, event) => {
                        if(event && event.type != "mouseup") return;
                        if(clip.fadein!= undefined) {
                            if(clip.attackPeak != undefined)
                                clip.attackPeak =  clip.fadein = Number((value[0][0] + clip.start).toFixed(2));
                            if(clip.ready != undefined)
                                clip.ready =  clip.fadein = Number((value[0][0] + clip.start).toFixed(2));
                        }
                        if(clip.fadeout!= undefined) {
                            clip.relax = clip.fadeout = Number((value[1][0] + clip.start).toFixed(2));
                        }
                        updateTracks(true);
                        // this.updateClipPanel(clip);
        
                    }, {xrange: [0, clip.duration], allow_add_values: false, draggable_y: false, smooth: 0.2});
                }
                widgets.merge();
            }

            widgets.addButton(null, "Delete", (v, e) => this.clipsTimeline.deleteClip(e, this.clipsTimeline.lastClipsSelected[this.clipsTimeline.lastClipsSelected.length - 1], () => {
                clip = null;  
                // this.clipsTimeline.optimizeTracks(); 
                updateTracks(); 
                this.editor.gizmo.updateTracks();
                this.updateClipPanel();
            }));
            
        }
        widgets.onRefresh(clip);
        
    }

    showGuide() {
        
        this.prompt = new LX.Dialog("How to start?", (p) =>{
            p.addText(null, "You can create an animation from a selected clip or from a preset configuration. You can also import animations or presets in JSON format following the BML standard.", null, {disabled: true, height: "50%"})
            p.addText(null, "Go to Menubar/Timeline/Shortcuts/ for more information about the tool.", null, {disabled: true, height: "50%"})
        }, {closable: true, onclose: (root) => {
            root.remove();
            this.prompt = null;
            LX.popup("Click on Timeline tab to discover all the available interactions.", "Useful info!", {position: [ "10px", "50px"], timeout: 5000})
        },
        size: ["30%", 200], modal: true
    })

    }

   createNewPresetDialog() {

        const saveDialog = this.prompt = new LX.Dialog("Save preset", (p) => {
            let presetInfo = { from: "Selected clips", type: "presets", server: false, clips:[] };

            p.addComboButtons("Save from", [{value: "Selected clips", callback: (v) => {
                presetInfo.from = v;

            }}, {value: "All clips", callback: (v) => {
                presetInfo.from = v;
            }}], {selected: presetInfo.from});
            p.addCheckbox("Upload to server", presetInfo.server, (v) =>  presetInfo.server = v);
           
            p.addText("Name", "", (v) => {
                presetInfo.preset = v;
            })
            p.sameLine(2);
            p.addButton(null, "Cancel", () => this.prompt.close());
            p.addButton(null, "Save", () => {
                
                let clips = null;
                let globalStart = 10000;
                let globalEnd = -10000;

                if(presetInfo.preset === "" || !presetInfo.preset) {
                    alert("You have to write a name.");
                    return;
                }
                if(!presetInfo.clips.length) {
                    if(presetInfo.from == "Selected clips") {
                        this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                            if(a[0]<b[0]) 
                                return -1;
                            return 1;
                        });
                        
                        clips = this.clipsTimeline.lastClipsSelected;
                        for(let i = 0; i < clips.length; i++){
                            const [trackIdx, clipIdx] = clips[i];
                            const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                            if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                            if(clip.ready!=undefined) clip.ready = clip.fadein;
                            if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                            if(clip.relax!=undefined) clip.relax = clip.fadeout;
                            if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                            presetInfo.clips.push(clip);
                            globalStart = Math.min(globalStart, clip.start || globalStart);
                            globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                        }
                    } 
                    else {
                        const tracks = this.clipsTimeline.animationClip.tracks;
                        for(let trackIdx = 0; trackIdx < tracks.length; trackIdx++){
                            for(let clipIdx = 0; clipIdx < tracks[trackIdx].clips.length; clipIdx++){
                                const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                                if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                                if(clip.ready!=undefined) clip.ready = clip.fadein;
                                if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                                if(clip.relax!=undefined) clip.relax = clip.fadeout;
                                if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                                presetInfo.clips.push(clip);
                                globalStart = Math.min(globalStart, clip.start || globalStart);
                                globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                            }
                        }
                    }
                    
                    presetInfo.duration = globalEnd - globalStart;
                    let preset = new ANIM.FacePresetClip(presetInfo);
    
                    //Convert data to bml file format
                    let data = preset.toJSON();
                    presetInfo.clips = data.clips;
                }
                
                if(!presetInfo.clips.length) {
                    alert("You can't create an empty preset.")
                    return;
                }
                const session = this.editor.FS.getSession();
                if(!presetInfo.server) {
                    this.editor.updateData(presetInfo.preset + ".Preset", presetInfo.clips, presetInfo.type,  "local", (v) => {
                        saveDialog.close()
                        this.closeDialogs();
                        LX.popup('"' + presetInfo.preset + '"' + " created successfully.", "New preset!", {position: [ "10px", "50px"], timeout: 5000});
                        // this.repository.presets[1] = this.localStorage.presets;
                    });
                }
                else if(!session.user || session.user.username == "signon") {
                    let alert = new LX.Dialog("Alert", d => {
                        d.addText(null, "The preset will be saved locally. You must be logged in to save it into server.", null, {disabled:true});
                        d.sameLine(2);
                        d.addButton(null, "Login", () => {
                            this.showLoginModal();
                            alert.close();
                        })
                        d.addButton(null, "Ok", () => {
                            this.editor.updateData(presetInfo.preset + ".Preset", presetInfo.clips, presetInfo.type,  "local", (v) => {
                                saveDialog.close();
                                this.closeDialogs();
                                alert.close();
                                LX.popup('"' + presetInfo.preset + '"' + " created successfully.", "New preset!", {position: [ "10px", "50px"], timeout: 5000});
                                // this.repository.presets[1] = this.localStorage.presets;
                            });
                        })
                    }, {closable: true, modal: true})
                }
                else {
                    this.editor.updateData(presetInfo.preset + ".bml", presetInfo.clips, presetInfo.type, "server", (filename) => {
                        saveDialog.close()
                        this.closeDialogs();
                        LX.popup('"' + filename + '"' + " created and uploaded successfully.", "New preset!", {position: [ "10px", "50px"], timeout: 5000});
                        
                    });
                }

            }, { buttonClass: "accept" });
        }, {modal: true, closable: true,  onclose: (root) => {
                        
            root.remove();
            this.prompt = null;
        } });

       
    }

   createNewSignDialog(clips, location) {
        
        const saveDialog = this.prompt = new LX.Dialog("Save animation", (p) => {
            let signInfo = {clips:[], type: "signs"};

            p.addText("Sign name", "", (v) => {
                signInfo.id = v;
            })
            p.sameLine(2);
            p.addButton(null, "Cancel", () => this.prompt.close());
            p.addButton(null, "Save", () => {

                if(signInfo.id === "" || !signInfo.id) {
                    alert("You have to write a name.")
                    return;
                }
                if(!signInfo.clips.length) {
                    let globalStart = 10000;
                    let globalEnd = -10000;

                    const tracks = this.clipsTimeline.animationClip.tracks;
                    if(clips) {
                        for(let i = 0; i < clips.length; i++){
                                let [trackIdx, clipIdx] = clips[i];
                                const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                                if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                                if(clip.ready!=undefined) clip.ready = clip.fadein;
                                if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                                if(clip.relax!=undefined) clip.relax = clip.fadeout;
                                if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                                signInfo.clips.push(clip);
                                globalStart = Math.min(globalStart, clip.start || globalStart);
                                globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                        }
                    }
                    else {
                        for(let trackIdx = 0; trackIdx < tracks.length; trackIdx++){
                            for(let clipIdx = 0; clipIdx < tracks[trackIdx].clips.length; clipIdx++){
                                const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                            if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                                if(clip.ready!=undefined) clip.ready = clip.fadein;
                                if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                                if(clip.relax!=undefined) clip.relax = clip.fadeout;
                                if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                                signInfo.clips.push(clip);
                                globalStart = Math.min(globalStart, clip.start || globalStart);
                                globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                            }
                        }
                    }
                    
                    signInfo.duration = globalEnd - globalStart;
                    let sign = new ANIM.SuperClip(signInfo);

                    //Convert data to bml file format
                    let data = sign.toJSON();
                    delete data.id;
                    delete data.start;
                    delete data.end;
                    delete data.type;
                    let bml = [];
                    for(let b in data) {
                        if(b == "glossa") {

                            delete data[b].id;
                            delete data[b].start;
                            delete data[b].end;
                            delete data[b].type;
                            for(let i = 0; i < data[b].length; i++) {
                                delete data[b][i].id;
                                delete data[b][i].start;
                                delete data[b][i].end;
                                delete data[b][i].type;
                                for(let g in data[b][i]) {

                                    bml = [...bml, ...data[b][i][g]];
                                }
                            }
                        }
                        else
                            bml = [...bml, ...data[b]];
                    }
                    signInfo.clips = bml;
                }

                if(!signInfo.clips.length) {
                    alert("You can't save an animation with empty tracks.")
                    return;
                }
                const session = this.editor.FS.getSession();
                if(!session.user || session.user.username == "signon") {
                    let alert = new LX.Dialog("Alert", d => {
                        d.addText(null, "The animation will be saved locally. You must be logged in to save it into server.", null, {disabled:true});
                        d.sameLine(2);
                        d.addButton(null, "Login", () => {
                            this.showLoginModal();
                            alert.close();
                        })
                        d.addButton(null, "Ok", () => {
                            this.editor.updateData(signInfo.id + ".bml", signInfo.clips , signInfo.type,  "local", (filename) => {
                                saveDialog.close();
                                this.closeDialogs();
                                alert.close();
                                LX.popup('"' + filename + '"' + " created successfully.", "New animation!", {position: [ "10px", "50px"], timeout: 5000});
                                // this.repository.presets[1] = this.localStorage.presets;
                            });
                        })
                    }, {closable: true, modal: true})
                    
                }
                else {
                    this.editor.updateData(signInfo.id + ".bml", signInfo.clips, signInfo.type, "server", (filename) => {
                        saveDialog.close()
                        this.closeDialogs();
                        LX.popup('"' + filename + '"' + " created and uploaded successfully.", "New animation!", {position: [ "10px", "50px"], timeout: 5000});
                        
                    });
                }
            },
            {
                onclose: (root) => {
                
                    root.remove();
                    this.prompt = null;
                }, 
                buttonClass: "accept" 
            } )
        }, {modal: true, closable: true})
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

                that.clipsTimeline.addClip( new ANIM[asset.type](config));
                asset_browser.clear();
                dialog.close();
        }
        let preview_actions =  [{
            type: "Clip",
            name: 'Add clip', 
            callback: innerSelect,
            allowed_types: ["Clip"]
        }];

        let asset_browser = null;
        let dialog = this.prompt = new LX.Dialog('BML clips', (p) => {

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
            preview_actions.push({
                type: "FaceLexemeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            // Face lexemes & Mouthing clips
            asset_data[0].children = [{ id: "Face lexemes", type: "folder", children: lexemes}, {id: "Mouthing", type: "MouthingClip"}];
            preview_actions.push({
                type: "MouthingClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
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

            preview_actions.push({
                type: "GazeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
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
            preview_actions.push({
                type: "HeadClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            asset_data[1].children = [{ id: "Gaze", type: "folder", children: gazes}, {id: "Head movement", type: "folder", children: movements}];

            asset_data[2].children = [{id: "Elbow Raise", type: "ElbowRaiseClip"}, {id: "Shoulder Raise", type: "ShoulderClip"}, {id:"Shoulder Hunch", type: "ShoulderClip"}, {id: "Arm Location", type: "ArmLocationClip"}, {id: "Hand Constellation", type: "HandConstellationClip"}, {id: "Directed Motion", type: "DirectedMotionClip"}, {id: "Circular Motion", type: "CircularMotionClip"}];
            preview_actions.push({
                type: "ElbowRaiseClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "ShoulderClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "ArmLocationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "HandConstellationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "DirectedMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "CircularMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            asset_data[3].children = [{id: "Palm Orientation", type: "PalmOrientationClip"}, {id: "Hand Orientation", type: "HandOrientationClip"}, {id: "Handshape", type: "HandshapeClip"}, {id: "Wrist Motion", type: "WristMotionClip"}, {id: "Fingerplay Motion", type: "FingerplayMotionClip"}];
            preview_actions.push({
                type: "PalmOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "HandOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "WristMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            preview_actions.push({
                type: "FingerplayMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })
            // BODY
            asset_data[4].children.push({id: "Body movement", type: "BodyMovementClip"});
            preview_actions.push({
                type: "BodyMovementClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowed_types: ["Clip"]
            })

            asset_browser = new LX.AssetView({ preview_actions });
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
        },{ title:'Lexemes', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: true, context_menu: false,
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
         });
       
    }

    
    createPresetsDialog() {
        
        let that = this;
        if(this.prompt && this.prompt.root.checkVisibility())
            return;

        // Create a new dialog
        let dialog = this.prompt = new LX.Dialog('Available presets', async (p) => {

            const innerSelect = (asset)  => {
                this.clipsTimeline.unSelectAllClips();
                
                let name = asset.id.split(".");
                if(name.length > 1)
                    name.pop();
                name = name.join(".");

                let preset = {preset: name};
                if(asset.type == "bml" && !asset.bml) {
                    this.editor.fileToBML(asset, async (data) =>  {
                        asset = data;
                        let {clips, duration} = await this.dataToBMLClips(asset.bml);
                        preset.clips = clips;
                        let presetClip = new ANIM.FacePresetClip(preset);
                        this.clipsTimeline.addClips(presetClip.clips);
                    });
                }
                else {
                    let presetClip = new ANIM.FacePresetClip(preset);
                    this.clipsTimeline.addClips(presetClip.clips);
                }
                this.prompt.close();
            }
            
            let preview_actions = [{
                type: "Preset",
                name: 'Add', 
                callback: innerSelect.bind(this),
            },
            {
                type: "bml",
                name: 'Add', 
                callback: innerSelect.bind(this),
            }];
            
            const session = this.editor.FS.getSession();
            if(session.user.username != "signon") {
                preview_actions.push({
                    type: "Preset",
                    path: "@/Local",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.updateData(item.filename + ".bml", item.data, "presets", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New preset!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                preview_actions.push({
                    type: "Preset",
                    path: "@/"+ session.user.username,
                    name: 'Delete', 
                    callback: (item)=> {
                        this.editor.deleteData(item.fullpath, "presets", "server", (v) => {
                            if(v === true) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Preset removed!", {position: [ "10px", "50px"], timeout: 5000});
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            
                            this.closeDialogs();
                            
                        });
                    }
                });
                preview_actions.push({
                    type: "bml",
                    path: "@/"+ session.user.username,
                    name: 'Delete', 
                    callback: (item)=> {
                        this.editor.deleteData(item.fullpath, "presets", "server", (v) => {
                            if(v === true) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Preset removed!", {position: [ "10px", "50px"], timeout: 5000});
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            loadData();
                            item.folder.domEl.click()
                            // this.closeDialogs();
                            
                        });
                    }
                });
            }
            
            let asset_browser = new LX.AssetView({  allowed_types: ["Preset"], preview_actions: preview_actions, context_menu: false });

            p.attach( asset_browser );

            const modal = this.createAnimation({closable:false , size: ["80%", "70%"]});
            modal.root.id = "loading";
            const closeModal = (modal ) => {
                modal.panel.clear();
                modal.root.remove();

            }

            const loadData = () => {
                asset_browser.load( this.editor.repository.presets, e => {
                    switch(e.type) {
                        case LX.AssetViewEvent.ASSET_SELECTED: 
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
                            innerSelect(e.item);
                            break;
                        case LX.AssetViewEvent.ENTER_FOLDER:
                            const session = this.editor.FS.getSession(); 
                            if(e.item.unit && e.item.unit != "signon" && (!e.item.children.length || this.editor.refreshPresetsRepository && e.item.unit == session.user.username )) {
                                const modal = this.createAnimation({closable:false , size: ["80%", "70%"]});
                                modal.root.id = "loading";
                                this.editor.getFilesFromUnit(e.item.unit, "animics/presets/" + (e.item.id == e.item.unit ? "" : e.item.id), (files, resp) => {
                                    let files_data = [];
                                    if(files) {
                                        
                                        for(let f = 0; f < files.length; f++) {
                                            files[f].id = files[f].filename;
                                            files[f].folder = e.item;
                                            files[f].type = files[f].filename.split(".")[1];
                                            if(files[f].type == "txt")
                                                continue;
                                            files_data.push(files[f]);
                                        }
                                        e.item.children = files_data;
                                    
                                    }
                                    asset_browser.currentData = files_data;
                                    asset_browser._updatePath(asset_browser.currentData);
                                    if(!asset_browser.skip_browser)
                                        asset_browser._createTreePanel();
                                    asset_browser._refreshContent();

                                    this.editor.refreshPresetsRepository = false;
                                    closeModal(modal);
                                })
                            }
                            break;
                    }
                })
            }

            if(!this.editor.repository.presets.length) {
                await this.editor.getAllUnitsFolders("presets", () => {
                    let values = ANIM.FacePresetClip.facePreset; //["Yes/No-Question", "Negative", "WH-word Questions", "Topic", "RH-Questions"];

                    let asset_data = [];            
                    // Create a collection of widgets values
                    for(let i = 0; i < values.length; i++){
                        let data = { id: values[i], type: "Preset" };
                        asset_data.push(data);
                    }
                    for(let i = 0; i < this.editor.repository.presets.length; i++) {
                        if(this.editor.repository.presets[i].id == "Public" || this.editor.repository.presets[i].id == "signon")
                            this.editor.repository.presets[i].children = asset_data;
                    }
                    closeModal(modal);
                    loadData();
                });
            }
            else {

                await this.editor.getFolders("presets", () => {
                    closeModal(modal);
                    loadData();
                });
            }
        }, { title:'Presets', close: true, minimize: false, size: ["60%", "60%"], scroll: true, resizable: true, draggable: false, modal: true,
    
            onclose: (root) => {
                
                root.remove();
                this.prompt = null;
            }
        });
    }

    createSignsDialog() {
        
        let that = this;
        const fs = this.editor.FS;
        const session = fs.getSession();

        if(this.prompt && this.prompt.root.checkVisibility())
            return;
        
            // Create a new dialog
        let dialog = this.prompt = new LX.Dialog('Available signs', async (p) => {
            
            const innerSelect = async (asset, action) => {
                let choice = document.getElementById("choice-insert-mode");
                if(choice)
                    choice.remove();

                that.clipsTimeline.unSelectAllClips();
                asset.bml.name = asset.id;
                const modal = this.createAnimation();

                const loadClip = async  () => {
                    return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(this.loadBMLClip(asset.bml, null, action != "Add as single clip"));
                    }, 100)
                  });}
                
                await loadClip().then(() => modal.close());
    
                asset_browser.clear();
                dialog.close();
            }

            let preview_actions = [
                {
                    type: "sigml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "sigml",
                    name: 'Add as single clip', 
                    callback: innerSelect.bind("glossa")
                },
                {
                    type: "sigml",
                    name: 'Breakdown into BML clips', 
                    callback: innerSelect.bind("clips")
                },
                {
                    type: "bml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bml",
                    name: 'Add as single clip', 
                    callback: innerSelect.bind("glossa")
                },
                {
                    type: "bml",
                    name: 'Breakdown into BML clips', 
                    callback: innerSelect.bind("clips")
                }
            ];

            if(session.user.username != "signon") {
                preview_actions.push(
                {
                    type: "sigml",
                    path: "@/Local",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.updateData(item.filename + ".sigml", item.data, "signs", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New sign!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                preview_actions.push({
                    type: "bml",
                    path: "@/Local",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.updateData(item.filename + ".bml", item.data, "signs", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New sign!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                preview_actions.push({
                    type: "sigml",
                    path: "@/"+ session.user.username,
                    name: 'Delete', 
                    callback: (item)=> {
                        this.editor.deleteData(item.fullpath, "signs", "server", (v) => {
                            if(v === true) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Sign removed!", {position: [ "10px", "50px"], timeout: 5000});
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            this.closeDialogs();
                            
                        });
                    }
                });
                preview_actions.push({
                    type: "bml",
                    path: "@/"+ session.user.username,
                    name: 'Delete', 
                    callback: (item)=> {
                        this.editor.deleteData(item.fullpath, "signs", "server", (v) => {
                            if(v === true) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Sign removed!", {position: [ "10px", "50px"], timeout: 5000});
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            this.closeDialogs();
                            
                        });
                    }
                });
            }
            
            let asset_browser = new LX.AssetView({  allowed_types: ["sigml", "bml"],  preview_actions: preview_actions, context_menu: false});
            
            p.attach( asset_browser );
            const modal = this.createAnimation({closable:false , size: ["80%", "70%"]});
            modal.root.id = "loading";
            const closeModal = (modal ) => {
                modal.panel.clear();
                modal.root.remove();

            }
            
            const loadData = () => {
                asset_browser.load( this.editor.repository.signs, e => {
                    switch(e.type) {
                        case LX.AssetViewEvent.ASSET_SELECTED: 
                            //request data
                            if(e.item.type == "folder") {
                                return;
                            }
                            
                            if(!e.item.bml) {
                                this.editor.fileToBML(e.item);
                            }
                            
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
                            if(e.item.type != "folder") {
                                let choice = new LX.Dialog("Add sign", (p) => {
                                    if(!e.item.bml) {
                                        this.editor.fileToBML(e.item);
                                    }
                                    p.addText(null, "How do you want to insert the clip?", null, {disabled:true});
                                    p.sameLine(2);
                                    p.addButton(null, "Add as single clip", (v) => { choice.close(); this.closeDialogs(); innerSelect(e.item, v);} )
                                    p.addButton(null, "Breakdown into BML clips", (v) => { choice.close(); this.closeDialogs(); innerSelect(e.item, v);} )
                                }, {modal:true, closable: true, id: "choice-insert-mode"})
                            }
                            break;

                        case LX.AssetViewEvent.ENTER_FOLDER:
                            const session = this.editor.FS.getSession(); 
                            if(e.item.unit && (!e.item.children.length || this.editor.refreshSignsRepository && e.item.unit == session.user.username )) {
                                const modal = this.createAnimation({closable:false , size: ["80%", "70%"]});
                                modal.root.id = "loading";
                                this.editor.getFilesFromUnit(e.item.unit, "animics/signs/" + (e.item.id == e.item.unit ? "" : e.item.id), (files, resp) => {
                                    let files_data = [];
                                    if(files) {
                                        
                                        for(let f = 0; f < files.length; f++) {
                                            files[f].id = files[f].filename;
                                            files[f].folder = e.item;
                                            files[f].type = files[f].filename.split(".")[1];
                                            if(files[f].type == "txt")
                                                continue;
                                            files_data.push(files[f]);
                                        }
                                        e.item.children = files_data;
                                    }
                                    asset_browser.currentData = files_data;
                                    asset_browser._updatePath(asset_browser.currentData);

                                    if(!asset_browser.skip_browser)
                                        asset_browser._createTreePanel();
                                    asset_browser._refreshContent();

                                    this.editor.refreshSignsRepository = false;
                                    closeModal(modal);
                                })
                            }
                            break;
                    }
                })

                // if(!this.editor.dictionaries.length) {
                //     if(!modal)
                //         modal = this.createAnimation({closable:false , size: ["80%", "70%"]});
                //     setTimeout(loadData.bind(this,modal), 100);
                // }
                // else {
                //     if(modal) {
                //         modal.panel.clear();
                //         modal.root.remove();
                //     }
                        
                    
                // }
                
            }
            
            if(!this.editor.repository.signs.length) {
                await this.editor.getAllUnitsFolders("signs", () => {
                    this.editor.refreshSignsRepository = false;
                    closeModal(modal);
                    loadData();
                });
            }
            else {

                await this.editor.getFolders("signs", () => {
                    this.editor.refreshSignsRepository = false;

                    closeModal(modal);
                    loadData();
                });
            }
            // }
            // else {
            //     closeModal(modal);
            // }   
       
        }, { title:'Signs', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: false,  modal: true,
    
            onclose: (root) => {
                let loadingmodal = document.getElementById("loading")
                if(loadingmodal)
                    loadingmodal.remove();
                root.remove();
                this.prompt = null;
                if(!LX.modal.hidden)                 
                    LX.modal.toggle(true);
                if(this.choice) this.choice.close()
            }
        });
    }

    createExportBMLDialog() {
        this.prompt = LX.prompt("File name", "Export BML animation", (v) => this.editor.export("", v), {input: this.editor.clipName, required: true} )  
    }

    showSourceCode (asset) 
    {
        if(window.dialog) 
            window.dialog.destroy();
    
        window.dialog = new LX.PocketDialog("Editor", p => {
            const area = new LX.Area();
            p.attach( area );
            const filename = asset.filename;
            const type = asset.type;
            const name = filename.replace("."+ type, "");
            
            const setText = (text) => {
                let code_editor = new LX.CodeEditor(area, {
                    allow_add_scripts: false,
                    name: type,
                    title: name,
                    disable_edition: true
                });
                
                code_editor.setText(text);
                if(asset.type == "sigml") {
                    code_editor.addTab("bml", false, name);
                    let t = JSON.stringify(asset.bml.behaviours, function(key, value) {
                        // limit precision of floats
                        if (typeof value === 'number') {
                            return parseFloat(value.toFixed(3));
                        }
                        if(key == "gloss") {
                            return value.replaceAll(":", "_")
                        }
                        return value;
                    });
                    code_editor.openedTabs["bml"].lines = code_editor.toJSONFormat(t).split('\n');    
                }
                code_editor._changeLanguage( "JSON" );
            }
            //from server
            if(asset.fullpath) {
                const fs = this.editor.FS;
                LX.request({ url: fs.root+ "/"+ asset.fullpath, dataType: 'text/plain', success: (f) => {
                    const bytesize = f => new Blob([f]).size;
                    asset.bytesize = bytesize();
                    asset.bml = asset.type == "bml" ?  {data: JSON.parse(f)} : sigmlStringToBML(f);
                    asset.bml.behaviours = asset.bml.data;
                    let text = f.replaceAll('\r', '').replaceAll('\t', '');
                    setText(text)
                } });
            } else {
                //from local
                asset.bml = asset.type == "bml" ?  {data: (typeof sd == "string") ? JSON.parse(asset.data) : asset.data } : sigmlStringToBML(asset.data);
                asset.bml.behaviours = asset.bml.data;              
                let text = JSON.stringify(asset.bml.behaviours);
                setText(text);
            }
        }, { size: ["40%", "600px"], closable: true });

    }


    createSceneUI(area) {

        $(this.editor.orientationHelper.domElement).show();

        let editor = this.editor;
        let canvasButtons = [
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'fa-solid fa-table-cells',
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
                    
                    const video = document.getElementById("capture");
                    video.style.display = editor.showGUI ? "flex" : "none";
                }
            },
    
        ]
        area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }

    
}


export { Gui, KeyframesGui, ScriptGui };
