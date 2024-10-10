import { LX } from 'lexgui';

if(!LX) {
    throw("lexgui.js missing!");
}

LX.components.push( 'Timeline' );

/**
 * @class Session
 * @description Store info about timeline session
 */

class Session {

    constructor() {

        this.start_time = - 0.01;
        this.left_margin = 0;
        // this.current_time = 0;
        // this.last_time = 0;
        // this.seconds_to_pixels = 50;
        this.scroll_y = 0;
        // this.offset_y = 0;
        // this.selection = null;
    }
};

/**
 * @class Timeline
 * @description Agnostic timeline, do not impose any timeline content. Renders to a canvas
 */

class Timeline {

    /**
     * @param {string} name 
     * @param {object} options = {animationClip, selectedItems, position = [0,0], width, height, canvas, trackHeight, skipLock, skipVisibility}
     */
    constructor( name, options = {} ) {

        this.name = name ?? '';
        this.currentTime = 0;
        this.framerate = 30;
        this.opacity = options.opacity || 1;
        this.sidebarWidth = 0// 200;
        this.topMargin = 40;
        this.renderOutFrames = false;
        this.lastMouse = [];
        this.lastKeyFramesSelected = [];
        this.tracksDrawn = [];
        this.trackState = [];
        this.clipboard = null;
        this.grabTime = 0;
        this.timeBeforeMove = 0;
        this.tracksPerItem = {};
        this.tracksDictionary = {};
        this._times = [];

        this.onBeforeCreateTopBar = options.onBeforeCreateTopBar;
        this.onAfterCreateTopBar = options.onAfterCreateTopBar;
        this.onChangePlayMode = options.onChangePlayMode;

        this.playing = false;
        this.loop = options.loop ?? true;

        this.session = new Session();

        this.canvas = options.canvas ?? document.createElement('canvas');

        this.duration = 1;
        this.speed = 1;
        this.position = [0, 0];
        this.size = [ options.width ?? 400, options.height ?? 100];
        
        this.currentScroll = 0; //in percentage
        this.currentScrollInPixels = 0; //in pixels
        this.scrollableHeight = this.size[1]; //true height of the timeline content
       
        this.secondsToPixels = this.canvas.width/this.duration;
        this.pixelsToSeconds = 1 / this.secondsToPixels;
        this.selectedItems = options.selectedItems ?? null;
        this.animationClip = options.animationClip ?? null;
        this.trackHeight = options.trackHeight ?? 25;
        
        this.active = true;
        this.skipVisibility = options.skipVisibility ?? false;
        this.skipLock = options.skipLock ?? false;
        this.disableNewTracks = options.disableNewTracks ?? false;

        this.optimizeThreshold = 0.01;

        this.root = new LX.Area({className : 'lextimeline'});
        
        this.header_offset = 38;
        
        let width = options.width ? options.width : null;
        let height = options.height ? options.height - this.header_offset : null;

        let area = new LX.Area( {id: "bottom-timeline-area", width: width || "calc(100% - 7px)", height: height || "100%"});
        area.split({ type: "horizontal", sizes: ["15%", "85%"]});
        this.content_area = area;
        let [left, right] = area.sections;
        
        
        right.root.appendChild(this.canvas);
        this.canvasArea = right;
        this.canvasArea.root.classList.add("lextimelinearea");
        this.updateHeader();
        this.updateLeftPanel(left);
        this.root.root.appendChild(area.root);

        if(!options.canvas && this.name != '') {
            this.root.root.id = this.name;
            this.canvas.id = this.name + '-canvas';
        }

        // Process mouse events
        this.canvas.addEventListener("mousedown", this.processMouse.bind(this));
        this.canvas.addEventListener("mouseup", this.processMouse.bind(this));
        this.canvas.addEventListener("mousemove", this.processMouse.bind(this));
        this.canvas.addEventListener("wheel", this.processMouse.bind(this));
        this.canvas.addEventListener("dblclick", this.processMouse.bind(this));
        this.canvas.addEventListener("contextmenu", this.processMouse.bind(this));

        this.canvas.tabIndex = 1;
        // Process keys events
        this.canvasArea.root.addEventListener("keydown", this.processKeys.bind(this));

        right.onresize = bounding => {
            if(!(bounding.width && bounding.height)) 
                return;
            this.resizeCanvas( [ bounding.width, bounding.height + this.header_offset ] );
        }
        this.resize(this.size);
    }

    /**
     * @method updateHeader
     * @param {*}  
     */

    updateHeader() {

        if(this.header)
            this.header.clear();
        else {
            this.header = new LX.Panel({id:'lextimelineheader', height: this.header_offset+"px"});
            this.root.root.appendChild(this.header.root);
        }

        let header = this.header;
        LX.DEFAULT_NAME_WIDTH = "50%";
        header.sameLine();

        if(this.name) {
            header.addTitle(this.name);
        }

        header.addButton('', '<i class="fa-solid fa-'+ (this.playing ? 'pause' : 'play') +'"></i>', (value, event) => {
           this.changeState();
        }, {width: "40px", buttonClass: "accept"});

        header.addButton('', '<i class="fa-solid fa-rotate"></i>', (value, event) => {
            this.loop = !this.loop;
            if(this.onChangePlayMode) {
                this.onChangePlayMode(this.loop);
            }

        }, {width: "40px", selectable: true, selected: this.loop});
        
        if(this.onBeforeCreateTopBar)
            this.onBeforeCreateTopBar(header);

        header.addNumber("Current Time", this.currentTime, (value, event) => {
            if(value > this.duration) {
                value = this.duration;
                if(event.constructor != CustomEvent) {
                    LX.emit( "@on_current_time_" + this.constructor.name, value);
                }
            }
            
            this.currentTime = value;
            if(this.onSetTime)
                this.onSetTime(this.currentTime);
            
        }, {signal: "@on_current_time_" + this.constructor.name, step: 0.01, min: 0, precision: 3, skipSlider: true});        

        header.addNumber("Duration", +this.duration.toFixed(3), (value, event) => {
            this.setDuration(value, false)}, {step: 0.01, min: 0, signal: "@on_set_duration"
        });    

        header.addNumber("Speed", +this.speed.toFixed(3), (value, event) => {
            this.setSpeed(value)}, {step: 0.01});    
           
        if(this.onAfterCreateTopBar)
            this.onAfterCreateTopBar(header);      

        if(this.onShowOptimizeMenu)
            header.addButton("", '<i class="fa-solid fa-filter"></i>', (value, event) => {this.onShowOptimizeMenu(event)}, {width: "40px"});

        header.addButton("", '<i class="fa-solid fa-gear"></i>', (value, event) => {
            if(this.dialog)
                return;
            this.dialog = new LX.Dialog("Configuration", d => {
                d.addNumber("Framerate", this.framerate, (v) => {
                    this.framerate = v;
                }, {min: 0, disabled: false});
                d.addNumber("Num items", Object.keys(this.tracksPerItem).length, null, {disabled: true});
                d.addNumber("Num tracks", this.animationClip ? this.animationClip.tracks.length : 0, null, {disabled: true});
                if(this.onShowOptimizeMenu)
                    d.addNumber("Optimize Threshold", this.optimizeThreshold, v => {
                        this.optimizeThreshold = v;
                    }, {min: 0, max: 0.25, step: 0.001, precision: 4});
                
            }, {
                onclose: (root) => {
        
                    root.remove();
                    this.dialog = null;
                }
            })
        }, {width: "40px"})

        header.endLine();
        LX.DEFAULT_NAME_WIDTH = "30%";
    }

    /**
    * @method updateLeftPanel
    * 
    */
    updateLeftPanel(area) {


        let scrollTop = 0;
        if(this.leftPanel){
            scrollTop = this.leftPanel.root.children[1].scrollTop;
            this.leftPanel.clear();
        }
        else {
            this.leftPanel = area.addPanel({className: 'lextimelinepanel', width: "100%", height: "100%"});
        }

        let panel = this.leftPanel;
        panel.sameLine(2);
        let title = panel.addTitle("Tracks");
        
        if(!this.disableNewTracks) 
        {
            panel.addButton('', '<i class = "fa-solid fa-plus"></i>', (value, event) => {
                this.addNewTrack();
            }, {width: "40px", height: "40px"});            
        }
        panel.endLine();

        const styles = window.getComputedStyle(title);
        const titleHeight = title.clientHeight + parseFloat(styles['marginTop']) + parseFloat(styles['marginBottom']);
        
        let p = new LX.Panel({height: "calc(100% - " + titleHeight + "px)"});
        if(this.animationClip && this.selectedItems)  {
            let items = {'id': '', 'children': []};

            for(let i = 0; i < this.selectedItems.length; i++ ) {
                let selected = this.selectedItems[i];
                let t = {
                    'id': selected,
                    'skipVisibility': true,
                    'children': []
                }
                for(let j = 0; j < this.tracksPerItem[selected].length; j++) {
                    let track = this.tracksPerItem[selected][j];
                    let id = track.type ? track.type : track.name;

                    t.children.push({'id': id, 'skipVisibility': this.skipVisibility, visible: track.active, /*selected: track.isSelected,*/ 'children':[], actions : this.skipLock ? null : [{
                        'name':'Lock edition',
                        'icon': 'fa-solid '+ (track.locked ? 'fa-lock' : 'fa-lock-open'),                       
                        'callback': (node, el) => {
                            // TO DO (apply functionality)
                            let value = el.classList.contains('fa-lock');
                         
                            if(value) {
                                el.title = 'Lock edition';
                                el.classList.remove('fa-lock');
                                el.classList.add('fa-lock-open');    
                            }
                            else {
                                el.title = 'Unlock edition';
                                el.classList.remove('fa-lock-open');
                                el.classList.add('fa-lock');                                 
                            }
                            let tracks = this.tracksPerItem[node.parent.id];
                            let type = node.id.replaceAll(node.parent.id, "").replaceAll(" (", "").replaceAll(")","");
                            let track = null;
                            for(let i = 0; i < tracks.length; i++) {
                                if(tracks[i].name == node.parent.id && type.includes(tracks[i].type)) {
                                    tracks[i].locked = !value;
                                    track = tracks[i];
                                }
                            }
                            if(this.onLockTrack)
                                this.onLockTrack(el, track, node)
                        }
                         
                    }]})
                    // panel.addTitle(track.name + (track.type? '(' + track.type + ')' : ''));
                }
                items.children.push(t);
                let el = p.addTree(null, t, {filter: false, rename: false, draggable: false, onevent: (e) => {
                    switch(e.type) {
                        case LX.TreeEvent.NODE_SELECTED:
                            this.selectTrack(e.node);
                            break;
                        case LX.TreeEvent.NODE_VISIBILITY:    
                            this.changeTrackVisibility(e.node, e.value);
                            break;
                        case LX.TreeEvent.NODE_CARETCHANGED:    
                            this.changeTrackDisplay(e.node, e.node.closed);
                            break;
                    }
                }});

            }
        }
        panel.attach(p.root)
        p.root.style.overflowY = "scroll";
        p.root.addEventListener("scroll", (e) => {
            this.currentScroll = e.currentTarget.scrollTop/(e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
         })
        // for(let i = 0; i < this.animationClip.tracks.length; i++) {
        //     let track = this.animationClip.tracks[i];
        //     panel.addTitle(track.name + (track.type? '(' + track.type + ')' : ''));
        // }
        this.leftPanel.root.children[1].scrollTop = scrollTop;

        if(this.leftPanel.parent.root.classList.contains("hidden") || !this.root.root.parent)
            return;
        this.resizeCanvas([ this.root.root.clientWidth - this.leftPanel.root.clientWidth  - 8, this.size[1]]);
    }

    /**
     * @method addNewTrack
     */

    addNewTrack() {

        if(!this.animationClip)
            this.animationClip = {tracks:[]};

        let trackInfo = {
            idx: this.animationClip.tracks.length,
            values: [], times: [],
            selected: [], edited: [], hovered: []
        };

        this.animationClip.tracks.push(trackInfo);
        this.updateLeftPanel();
        return trackInfo.idx;
    }

    getTracksInRange( minY, maxY, threshold ) {

        let tracks = [];

        // Manage negative selection
        if(minY > maxY) {
            let aux = minY;
            minY = maxY;
            maxY = aux;
        }

        for(let i = this.tracksDrawn.length - 1; i >= 0; --i) {
            let t = this.tracksDrawn[i];
            let pos = t[1] - this.topMargin, size = t[2];
            if( pos + threshold >= minY && (pos + size - threshold) <= maxY ) {
                tracks.push( t[0] );
            }
        }

        return tracks;
    }

    getCurrentContent(track, time, threshold) {

        if(this.getCurrentKeyFrame)
            return this.getCurrentKeyFrame(track, time, threshold);

        if(this.getCurrentClip)
            return this.getCurrentClip(track, time, threshold);
    }

    /**
     * @method setAnimationClip
     * @param {*} animation 
     * @param {boolean} needsToProcess
     * @param {obj} processOptions 
     * [KeyFrameTimeline] - each track should contain an attribute "dim" to indicate the value dimension (e.g. vector3 -> dim=3). Otherwise dimensions will be infered from track's values and times. Default is 1
     */
    setAnimationClip( animation, needsToProcess = true ) {
        if(!animation || !animation.tracks || needsToProcess) { 
            this.processTracks(animation); // generate default animationclip or process the user's one
        }
        else{
            this.animationClip = animation;
        }
       
        this.duration = this.animationClip.duration;
        this.speed = this.animationClip.speed ?? this.speed;
        this.secondsToPixels = ( this.canvas.width - this.session.left_margin ) / this.duration;
        this.pixelsToSeconds = 1 / this.secondsToPixels;
        //this.updateHeader();
        this.updateLeftPanel();
        return this.animationClip;
    }

    drawTimeInfo (w, h = this.topMargin) {

        let ctx = this.canvas.getContext("2d");
        ctx.font = "11px " + Timeline.FONT;//"11px Calibri";
        ctx.textAlign = "center";
        
        let canvas = this.canvas;
        
        // Draw time markers
        let startx = Math.round( this.timeToX( this.startTime ) ) + 0.5;
        let endx = Math.round( this.timeToX( this.endTime ) ) + 0.5;
        let tick_time = this.secondsToPixels > 400 ? 0.1 : 0.5;
        if(this.secondsToPixels < 100 )
            tick_time = 1;

        ctx.save();

        ctx.fillStyle = Timeline.BACKGROUND_COLOR;
        ctx.fillRect( this.session.left_margin, 0, canvas.width, h );
        ctx.strokeStyle = LX.Timeline.FONT_COLOR;

        if(this.secondsToPixels > 200 )
        {
            ctx.globalAlpha = 0.5 * (1.0 - LX.UTILS.clamp( 200 / this.secondsToPixels, 0, 1));
            ctx.beginPath();
            for( let time = this.startTime; time <= this.endTime; time += 1 / this.framerate )
            {
                let x = this.timeToX( time );
                if(x < this.session.left_margin)
                    continue;
                ctx.moveTo(Math.round(x) + 0.5, h * 0.9);
                ctx.lineTo(Math.round(x) + 0.5, h * 0.95);
            }
            ctx.stroke();
            ctx.globalAlpha = this.opacity;
        }

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        let times = this._times;
        this._times.length = 0;

        for( let time = this.startTime; time <= this.endTime; time += tick_time)
        {
            let x = this.timeToX( time );

            if(x < this.session.left_margin)
                continue;

            let is_tick = time % 5 == 0;
            if(is_tick || this.secondsToPixels > 70 ) {
                times.push([x,time]);
                ctx.moveTo(Math.round(x) + 0.5, h * 0.4 + (is_tick ? h * 0.3 : h * 0.4) );
                ctx.lineTo(Math.round(x) + 0.5, h * 0.95 );
                ctx.stroke();
            }
        }

        let x = startx;
        if(x < this.session.left_margin) {
            x = this.session.left_margin;            
        }
        //ctx.moveTo(x, h - 0.5);
        // ctx.lineTo( endx, h - 0.5);
        ctx.globalAlpha = this.opacity;

        // Time seconds in text
        ctx.fillStyle = Timeline.FONT_COLOR//"#888";
        for(var i = 0; i < times.length; ++i)
        {
            let time = times[i][1];
            ctx.fillText( time == (time|0) ? time : time.toFixed(1), times[i][0], h * 0.6);
        }

        ctx.restore();
    }

    drawTracksBackground(w, h) {

        let canvas = this.canvas;
        let ctx = canvas.getContext("2d");
        let duration = this.duration;
        ctx.globalAlpha = this.opacity;
        //content
        let margin = this.session.left_margin;
        let timeline_height = this.topMargin;
        let line_height = this.trackHeight;
    
        //fill track lines
        w = w || canvas.width;
        let max_tracks = Math.ceil( (h - timeline_height + this.currentScrollInPixels) / line_height );

        ctx.save();
        ctx.fillStyle = Timeline.BACKGROUND_COLOR;
        for(let i = 0; i <= max_tracks; ++i)
        {
            ctx.fillStyle = i % 2 == 0 ?  Timeline.TRACK_COLOR_PRIMARY:  Timeline.BACKGROUND_COLOR;
            ctx.fillRect(0, timeline_height + i * line_height  - this.currentScrollInPixels, w, line_height );
        }
    
        //black bg
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = Timeline.BACKGROUND_COLOR;
        ctx.fillRect( margin, 0, canvas.width - margin, canvas.height);
        ctx.globalAlpha = this.opacity;
        
        //bg lines
        ctx.strokeStyle = "#444";
        ctx.beginPath();
    
        let pos = this.timeToX( 0 );
        if(pos < margin)
            pos = margin;
        ctx.moveTo( pos + 0.5, timeline_height);
        ctx.lineTo( pos + 0.5, canvas.height);
        ctx.moveTo( Math.round( this.timeToX( duration ) ) + 0.5, timeline_height);
        ctx.lineTo( Math.round( this.timeToX( duration ) ) + 0.5, canvas.height);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * @method draw
     * @param {*} currentTime 
     * @param {*} rect 
     * TODO
     */

    draw( currentTime = this.currentTime, rect ) {

        let ctx = this.canvas.getContext("2d");
        ctx.textBaseline = "bottom";
        ctx.font = "11px " + Timeline.FONT;//"11px Calibri";
        if(!rect)
            rect = [0, 0, ctx.canvas.width, ctx.canvas.height ];

        // this.canvas = ctx.canvas;
        this.position[0] = rect[0];
        this.position[1] = rect[1];
        let w = rect[2];
        let h = rect[3];
        this.currentTime = currentTime;
        // this.updateHeader();
        this.currentScrollInPixels = this.scrollableHeight <= h ? 0 : (this.currentScroll * (this.scrollableHeight - h));

        //zoom
        if(this.duration > 0)
        {
            this.startTime = this.session.start_time ; //seconds
            if(this.startTime < 0)
                this.startTime = 0;
            // this.endTime = Math.ceil( this.startTime + (w - this.session.left_margin) * this.pixelsToSeconds );
            this.endTime = this.startTime + (w - this.session.left_margin) * this.pixelsToSeconds ;
            if(this.endTime > this.duration)
                this.endTime = this.duration;
            if(this.startTime > this.endTime) //avoids weird bug
                this.endTime = this.startTime + 1;
        }

        this.tracksDrawn.length = 0;

        // Background
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = Timeline.TRACK_COLOR_SECONDARY;
        ctx.clearRect(0,0, this.canvas.width, this.canvas.height );

        this.drawTracksBackground(w, h);

        if(this.animationClip) {
            
            ctx.translate( this.position[0], this.position[1] + this.topMargin ); //20 is the top margin area

            this.drawContent( ctx, this.timeStart, this.timeEnd, this );

            ctx.translate( -this.position[0], -(this.position[1] + this.topMargin) ); //20 is the top margin area
        }

        //scrollbar
        if( h < this.scrollableHeight ){
            ctx.fillStyle = "#222";
            ctx.fillRect( w - this.session.left_margin - 10, 0, 10, h );

            ctx.fillStyle = this.grabbingScroll ? Timeline.FONT_COLOR : Timeline.TRACK_COLOR_SECONDARY;
           
            let scrollBarHeight = Math.max( 10, (h-this.topMargin)* (h-this.topMargin)/ this.leftPanel.root.children[1].scrollHeight);
            let scrollLoc = this.currentScroll * ( h - this.topMargin - scrollBarHeight ) + this.topMargin;
            ctx.roundRect( w - 10, scrollLoc, 10, scrollBarHeight, 5, true );
        }
        this.drawTimeInfo(w);

        // Current time marker vertical line
        let truePos = Math.round( this.timeToX( this.currentTime ) ) + 0.5;
        let quantCurrentTime = Math.round( this.currentTime * this.framerate ) / this.framerate;
        let pos = Math.round( this.timeToX( quantCurrentTime ) ) + 0.5; //current_time is quantized
        
        let posy = this.topMargin * 0.4;
        if(pos >= this.session.left_margin)
        {
            ctx.strokeStyle = ctx.fillStyle =  LX.getThemeColor("global-selected");
            ctx.globalAlpha = this.opacity;
            ctx.beginPath();
            ctx.moveTo(truePos, posy * 0.6); ctx.lineTo(truePos, this.canvas.height);//line
            ctx.stroke();
            ctx.closePath();
            ctx.shadowBlur = 8;
            ctx.shadowColor = LX.getThemeColor("global-selected");
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;

            ctx.roundRect( truePos - 10, posy * 0.6, 20, posy, 5, true );
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        // Current time seconds in text
        ctx.font = "11px " + Timeline.FONT;//"11px Calibri";
        ctx.textAlign = "center";
        //ctx.textBaseline = "middle";
        ctx.fillStyle = Timeline.COLOR_INACTIVE//"#888";
        ctx.fillText( this.currentTime.toFixed(1), truePos,  this.topMargin * 0.6  );

        // Selections
        ctx.strokeStyle = ctx.fillStyle =  Timeline.FONT_COLOR;
        ctx.translate( this.position[0], this.position[1] + this.topMargin )
        if(this.boxSelection && this.boxSelectionStart && this.boxSelectionEnd) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = "#AAA";
            ctx.strokeRect( this.boxSelectionStart[0], this.boxSelectionStart[1], this.boxSelectionEnd[0] - this.boxSelectionStart[0], this.boxSelectionEnd[1] - this.boxSelectionStart[1]);
            ctx.fillRect( this.boxSelectionStart[0], this.boxSelectionStart[1], this.boxSelectionEnd[0] - this.boxSelectionStart[0], this.boxSelectionEnd[1] - this.boxSelectionStart[1]);
            ctx.stroke();
            ctx.globalAlpha = this.opacity;
        }
        ctx.translate( -this.position[0], -(this.position[1] + this.topMargin) ); //20 is the top margin area

    }

    /**
     * @method drawMarkers
     * @param {*} ctx 
     * @param {*} markers 
     * TODO
     */

    drawMarkers( ctx, markers ) {

        //render markers
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        let markersPos = [];
        for (let i = 0; i < markers.length; ++i) {
            let marker = markers[i];
            if (marker.time < this.startTime - this.pixelsToSeconds * 100 ||
                marker.time > this.endTime)
                continue;
            var x = this.timeToX(marker.time);
            markersPos.push(x);
            ctx.save();
            ctx.translate(x, 0);
            ctx.rotate(Math.PI * -0.25);
            ctx.fillText(marker.title, 20, 4);
            ctx.restore();
        }

        if (markersPos.length) {
            ctx.beginPath();
            for (var i = 0; i < markersPos.length; ++i) {
                ctx.moveTo(markersPos[i] - 5, 0);
                ctx.lineTo(markersPos[i], -5);
                ctx.lineTo(markersPos[i] + 5, 0);
                ctx.lineTo(markersPos[i], 5);
                ctx.lineTo(markersPos[i] - 5, 0);
            }
            ctx.fill();
        }
    }

    /**
     * @method clearState
     */

    clearState() {
        this.trackState = [];
    }

    /**
     * @method setDuration
     * @param {Number} t 
     */

    setDuration( t, updateHeader = true ) {
        let v = this.validateDuration(t);
        let decimals = t.toString().split('.')[1] ? t.toString().split('.')[1].length : 0;
        updateHeader = (updateHeader || +v.toFixed(decimals) != t);
        this.duration = this.animationClip.duration = v; 

        this.secondsToPixels = ( this.canvas.width - this.session.left_margin ) / this.duration;
        this.pixelsToSeconds = 1 / this.secondsToPixels;

        if(updateHeader) {
            LX.emit( "@on_set_duration", +v.toFixed(3));
        }

        if( this.onSetDuration ) 
            this.onSetDuration( v );	 
    }

    /**
     * @method validateDuration
     * @param {Number} t 
     * @returns minimum available duration
     */
    validateDuration(t) {
        return t;
    }


        /**
     * @method setSpeed
     * @param {Number} speed 
     */

    setSpeed(speed) {
        this.speed = speed;
        LX.emit( "@on_set_speed", +speed.toFixed(3));
        

        if( this.onSetSpeed ) 
            this.onSetSpeed( speed );	 
    }

    // Converts distance in pixels to time
    xToTime( x ) {
        return (x - this.session.left_margin) / this.secondsToPixels + this.session.start_time;
    }

    // Converts time to disance in pixels
    timeToX( t ) {
        return this.session.left_margin + (t - this.session.start_time) * this.secondsToPixels;
    }

    getCurrentFrame( framerate ) {
        return Math.floor(this.currentTime * framerate);
    }
    
    /**
     * @method setScale
     * @param {*} v
     * TODO
     */

    setScale( v ) {

        if(!this.session)
            return;

        const xCurrentTime = this.timeToX(this.currentTime);
        this.secondsToPixels *= v;
        this.pixelsToSeconds = 1 / this.secondsToPixels;
        this.session.start_time += this.currentTime - this.xToTime(xCurrentTime);
    }
    
    /**
     * @method setFramerate
     * @param {*} v
     */

    setFramerate( v ) {
        this.framerate = v;
    }

    /**
     * @method processMouse
     * @param {*} e
     */

    processMouse( e ) {

        if(!this.canvas)
            return;
    
        e.multipleSelection = false;

        let h = this.canvas.height;
        let w = this.canvas.width;

        // Process mouse
        let x = e.offsetX;
        let y = e.offsetY;
        e.deltax = x - this.lastMouse[0];
        e.deltay = y - this.lastMouse[1];
        let localX = e.offsetX - this.position[0];
        let localY = e.offsetY - this.position[1];

        let timeX = this.timeToX( this.currentTime );
        let current_grabbing_timeline = localY < this.topMargin && localX > this.session.left_margin && 
        localX > (timeX - 6) && localX < (timeX + 6);

        if( current_grabbing_timeline ) {
            this.canvas.style.cursor = "col-resize";
        }
        else if(this.movingKeys) {
            this.canvas.style.cursor = "grabbing";    
        }
        else if(e.shiftKey) {
            this.canvas.style.cursor = "crosshair";
        }
        else {
            this.canvas.style.cursor = "default";
        }

        if( e.type == "wheel" ) {
            if(e.shiftKey)
            {
                // mouseTime = xToTime(localX)_prev = xToTime(localX)_after
                //(x - this.session.left_margin) / this.secondsToPixels_prev + this.session.start_time_prev = (x - this.session.left_margin) / this.secondsToPixels_after + this.session.start_time_after
                // start_time = xToTime(localX)_prev - (x - this.session.left_margin) / this.secondsToPixels_after
                let mouseTime = this.xToTime(localX);
                this.setScale( e.wheelDelta < 0 ? 0.95 : 1.05 );
                this.session.start_time = mouseTime - (localX - this.session.left_margin) / this.secondsToPixels;
            }
            else if( h < this.scrollableHeight)
            {              
                this.leftPanel.root.children[1].scrollTop += e.deltaY;
            }
            
            return;
        }

        var time = this.xToTime(x, true);

        var is_inside = x >= this.position[0] && x <= (this.position[0] + this.size[0]) &&
                        y >= this.position[1] && y <= (this.position[1] + this.size[1]);

        var track = null;
        for(var i = this.tracksDrawn.length - 1; i >= 0; --i)
        {
            var t = this.tracksDrawn[i];
            if( t[1] >= this.topMargin && localY >= t[1] && localY < (t[1] + t[2]) )
            {
                track = t[0];
                break;
            }
        }

        e.track = track;
        e.localX = localX;
        e.localY = localY;

        const innerSetTime = (t) => { 
            LX.emit( "@on_current_time_" + this.constructor.name, t);
            // if( this.onSetTime ) 
            // this.onSetTime( t );	 
        }

        if( e.type == "mouseup" )
        {
            if(!this.active) {
                this.grabbing_timeline = false;
                this.grabbing = false;
                this.grabbingScroll = false;
                this.movingKeys = false;
                this.timeBeforeMove = null;
                return;
            }
            // this.canvas.style.cursor = "default";
            const discard = this.movingKeys || (LX.UTILS.getTime() - this.clickTime) > 420; // ms
            this.movingKeys ? innerSetTime( this.currentTime ) : 0;

            this.grabbing_timeline = false;
            this.grabbing = false;
            this.grabbingScroll = false;
            this.movingKeys = false;
            this.timeBeforeMove = null;
            e.discard = discard;
            
            if(e.localY <= this.topMargin && !e.shiftKey) {
                this.currentTime = Math.max(0, time);
                innerSetTime(this.currentTime);
                return;
            }
            
            if( e.button == 0 && this.onMouseUp ) {
                this.onMouseUp(e, time);
            }
            this.unSelectAllTracks();
        }
    

        if( e.type == "mousedown")	{
            
            this.clickTime = LX.UTILS.getTime();

            if(this.trackBulletCallback && e.track)
                this.trackBulletCallback(e.track,e,this,[localX,localY]);

            
            if( h < this.scrollableHeight && x > w - 10 )
            {
                this.grabbingScroll = true;
                this.grabbing = true;
            }
            else
            {
                
                this.grabbing = true;
                this.grabTime = time;
                if(!track || track && this.getCurrentContent(track, time, 0.001) == -1) {
                    this.grabbing_timeline = current_grabbing_timeline;
                }
                if(this.onMouseDown && this.active )
                    this.onMouseDown(e, time);
            }
        }
        else if( e.type == "mousemove" ) {

            if(e.shiftKey && this.active) {
                if(this.boxSelection) {
                    this.boxSelectionEnd = [localX, localY - this.topMargin ];
                    return; // Handled
                }
            }
            else if(this.grabbing && e.button !=2 && !this.movingKeys ) {
                this.canvas.style.cursor = "grabbing"; 
                if(this.grabbing_timeline  && this.active)
                {
                    let time = this.xToTime( localX );
                    time = Math.max(0, time);
                    this.currentTime = Math.min(this.duration, time);
                    LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime );
                }
                else if(this.grabbingScroll)
                {
                    let h = this.leftPanel.root.clientHeight;
                    let scrollBarHeight = Math.max( 10, (h-this.topMargin)* (h-this.topMargin)/this.leftPanel.root.children[1].scrollHeight);
                    let minScrollLoc = this.topMargin;
                    let maxScrollLoc = h - scrollBarHeight; // - sizeScrollBar

                    this.currentScroll = Math.min( 1, Math.max(e.localY - minScrollLoc, 0 ) / (maxScrollLoc - minScrollLoc) );
                    this.leftPanel.root.children[1].scrollTop = this.currentScroll * (this.leftPanel.root.children[1].scrollHeight-this.leftPanel.root.children[1].clientHeight);
                }
                else
                {
                    // Move timeline in X (independent of current time)
                    var old = this.xToTime( this.lastMouse[0] );
                    var now = this.xToTime( e.offsetX );
                    this.session.start_time += (old - now);

                    this.leftPanel.root.children[1].scrollTop -= e.deltay; // will automatically call scroll event

                }
            }

            if(this.onMouseMove) {
                this.onMouseMove(e, time);
            }
        }
        else if (e.type == "dblclick" && this.onDblClick) {
            this.onDblClick(e);	
        }
        else if (e.type == "contextmenu" && this.showContextMenu && this.active) {
            this.showContextMenu(e);
        }

        this.lastMouse[0] = x;
        this.lastMouse[1] = y;

        if( !is_inside && !this.grabbing && !(e.metaKey || e.altKey ) ) {           
            return true;
        }

        if( this.onMouse && this.onMouse( e, time, this ) )
            return;

        return true;
    }
    
    /**
     * @method processKeys
     * @param {*} e
     */
    processKeys(e) {

        if( e.type == 'keydown' ) {
            switch(e.key) {
                case 'Delete': case 'Backspace':
                    this.deleteContent();
                    break;
                case 'c': case 'C':
                    if(e.ctrlKey)
                        this.copyContent();
                    break;
                case 'v': case 'V':
                    if(e.ctrlKey)
                        this.pasteContent();
                    break;
                case ' ':
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.changeState();
                    break; 

                case "Shift":
                    this.canvas.style.cursor = "crosshair";
                    break;
            }
        }
    }
    
    /**
     * @method changeState
     * @description change play/pause state
     * ...
     **/
    changeState() {
        this.playing = !this.playing;
        this.updateHeader();

        if(this.onChangeState) {
            this.onChangeState(this.playing);
        }
    }

    /**
     * @method drawTrackWithKeyframes
     * @param {*} ctx
     * ...
     * @description helper function, you can call it from drawContent to render all the keyframes
     * TODO
     */

    drawTrackWithKeyframes( ctx, y, trackHeight, title, track, trackInfo ) {
        
        if(trackInfo.enabled === false) {
            ctx.globalAlpha = 0.4;
        }

        ctx.font = Math.floor( trackHeight * 0.8) + "px" + Timeline.FONT;
        ctx.textAlign = "left";
       
        ctx.globalAlpha = 0.2;
        
        if(trackInfo.isSelected) {
            ctx.fillStyle = Timeline.TRACK_SELECTED;//"#2c303570";
            ctx.fillRect(0, y, ctx.canvas.width, trackHeight );
        }
        ctx.fillStyle = Timeline.COLOR;//"#2c303570";
        ctx.globalAlpha = 1;
       
        let keyframes = track.times;

        if(!keyframes) {
            return;
        }
        
        this.tracksDrawn.push([track,y+this.topMargin,trackHeight]);
        
        for(let j = 0; j < keyframes.length; ++j)
        {
            let time = keyframes[j];
            let selected = trackInfo.selected[j];
            if( time < this.startTime || time > this.endTime ) {
                continue;
            }
            let keyframePosX = this.timeToX( time );
            if( keyframePosX > this.sidebarWidth ){
                ctx.save();

                let margin = -1;
                let size = trackHeight * 0.3;
                
                if(trackInfo.edited[j]) {
                    ctx.fillStyle = Timeline.COLOR_EDITED;
                }
                
                if(selected) {
                    ctx.fillStyle = Timeline.COLOR_SELECTED;
                    ctx.shadowBlur = 8;
                    size = trackHeight * 0.35;
                    margin = 0;
                }

                if(trackInfo.hovered[j]) {
                    size = trackHeight * 0.35;
                    ctx.fillStyle = Timeline.COLOR_HOVERED;
                    ctx.shadowBlur = 8;
                    margin = 0;
                }
                if(trackInfo.locked) {
                    ctx.fillStyle = Timeline.COLOR_LOCK;
                }

                if(!this.active || trackInfo.active == false) {
                    ctx.fillStyle = Timeline.COLOR_INACTIVE;
                }
                    
                ctx.translate(keyframePosX, y + this.trackHeight * 0.75 + margin);
                ctx.rotate(45 * Math.PI / 180);		
                ctx.fillRect( -size, -size, size, size);
                if(selected) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect( -size*1.1, -size*1.1, size*1.2, size*1.2);
                }
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }
        

        ctx.globalAlpha = this.opacity;
    }

    /**
     * @method drawTrackWithBoxes
     * @param {*} ctx
     * ...
     * TODO
     */

    drawTrackWithBoxes( ctx, y, trackHeight, title, track ) {

        const  offset = (trackHeight - trackHeight * 0.6) * 0.5;
        this.tracksDrawn.push([track, y + this.topMargin, trackHeight]);
        
        trackHeight *= 0.6;
        this.canvas = this.canvas || ctx.canvas;
        
        let selectedClipArea = null;

        if(track.enabled === false) {
            ctx.globalAlpha = 0.4;
        }
        else {
            ctx.globalAlpha = 0.2;
        }

        ctx.font = Math.floor( trackHeight * 0.8) + "px" + Timeline.FONT;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = Timeline.TRACK_SELECTED_LIGHT//"#2c303570";
        
        // Fill track background if it's selected
        if(track.isSelected) {
            ctx.fillRect(0, y + offset - 2, ctx.canvas.width, trackHeight + 4 );    
        }

        let clips = track.clips;
        let trackAlpha = 1;

        if(!clips) {
            return;
        }

        for(var j = 0; j < clips.length; ++j)
        {
            selectedClipArea = null;
            let clip = clips[j];
            //let selected = track.selected[j];
            var x = Math.floor( this.timeToX(clip.start) ) + 0.5;
            var x2 = Math.floor( this.timeToX( clip.start + clip.duration ) ) + 0.5;
            var w = x2-x;

            if( x2 < 0 || x > this.canvas.width )
                continue;
            
            // Overwrite clip color state depending on its state
            ctx.globalAlpha = trackAlpha;
            ctx.fillStyle = clip.clipColor || (track.hovered[j] ? Timeline.COLOR_HOVERED : (Timeline.COLOR));
            if(track.selected[j] && !clip.clipColor) {
                ctx.fillStyle = Timeline.TRACK_SELECTED;
            }
            if(!this.active || track.active == false) {
                ctx.fillStyle = Timeline.COLOR_INACTIVE;
            }

            // Draw clip background
            ctx.roundRect( x, y + offset, w, trackHeight , 5, true);
            
            // Compute timeline position of fade-in and fade-out clip times
            let fadeinX = this.secondsToPixels * ((clip.fadein || 0) - clip.start);
            let fadeoutX = this.secondsToPixels * (clip.start + clip.duration - (clip.fadeout || (clip.start + clip.duration)));
            
            if(this.active && track.active) {
                // Transform fade-in and fade-out fill color to RGBA
                if(ctx.fillStyle[0] == "#") {
                    let color = LX.UTILS.HexToRgb(ctx.fillStyle);
                    color = color.map(x => x*=0.8);
                    ctx.fillStyle = 'rgba(' + color.join(',') + ', 0.8)';
                }
                else {
                    ctx.globalAlpha = 0.8;
                }
            
                // Draw fade-in and fade-out
                if(fadeinX >= 0) {
                    ctx.roundRect(x, y + offset, fadeinX, trackHeight, {tl: 5, bl: 5, tr:0, br:0}, true);
                }
                if(fadeoutX) {
                    ctx.roundRect( x + w - fadeoutX, y + offset, fadeoutX, trackHeight, {tl: 0, bl: 0, tr:5, br:5}, true);
                }
            }
            
            ctx.fillStyle = clip.color || Timeline.FONT_COLOR; // clip.color || Timeline.FONT_COLOR;
            //ctx.font = "12px" + Timeline.FONT;

            // Overwrite style and draw clip selection area if it's selected
            ctx.globalAlpha = clip.hidden ? trackAlpha * 0.5 : trackAlpha;
            
            if(track.selected[j] || track.hovered[j]) {
                ctx.strokeStyle = ctx.shadowColor = track.clips[j].clipColor || Timeline.TRACK_SELECTED;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 1.5;
                ctx.shadowOffsetY = 1.5;
                
                selectedClipArea = [x - 1, y + offset -1, x2 - x + 2, trackHeight + 2];
                ctx.roundRect(selectedClipArea[0], selectedClipArea[1], selectedClipArea[2], selectedClipArea[3], 5, false, true);

                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.font = "bold" + Math.floor( trackHeight) + "px " + Timeline.FONT;
                ctx.fillStyle = "white";
            }

            // Overwrite style with small font size if it's zoomed out
            if( this.secondsToPixels < 200) {
                ctx.font = this.secondsToPixels*0.06  +"px" + Timeline.FONT;
            }

            const text = clip.id.replaceAll("_", " ").replaceAll("-", " ");
            const textInfo = ctx.measureText( text );
            
            // Draw clip name if it's readable
            if(this.secondsToPixels > 100) {
                ctx.fillText( text, x + (w - textInfo.width)*0.5,  y + offset + trackHeight * 0.5);
            }

            ctx.fillStyle = track.hovered[j] ? "white" : Timeline.FONT_COLOR;
            // Draw resize bounding
            ctx.roundRect(x + w - 8 , y + offset , 8, trackHeight, {tl: 4, bl: 4, tr:4, br:4}, true);           
        }

        ctx.font = "12px" + Timeline.FONT;
    }

    /**
    * @method selectTrack
    * @param {id, parent, children, visible} trackInfo 
    */

    selectTrack( trackInfo) {
        this.unSelectAllTracks();
        
        let [name, type] = trackInfo.id.split(" (");
        
        if(type)
            type = type.replaceAll(")", "").replaceAll(" ", "");
        else {
            type = name;
            name = trackInfo.parent ? trackInfo.parent.id : trackInfo.id;
        }
        let tracks = this.tracksPerItem[name];

        for(let i = 0; i < tracks.length; i++) {
            if(tracks[i].type != type && tracks.length > 1)
                continue;
            this.tracksPerItem[name][i].isSelected = true;
            trackInfo = this.tracksPerItem[name][i];
        }
        
        if(this.onSelectTrack)
            this.onSelectTrack(trackInfo);
    }

    unSelectAllTracks() {
        for(let i = 0; i < this.selectedItems.length; i++) {
            let item = this.selectedItems[i];
            let tracks = this.tracksPerItem[item];
            for(let t = 0; t < tracks.length; t++) {
                tracks[t].isSelected = false;
            }
        }
    }

    /**
    * @method changeTrackVisibility
    * @param {id, parent, children, visible} trackInfo 
    */

    changeTrackVisibility(trackInfo, visible) {
        let [name, type] = trackInfo.id.split(" (");
        if(type)
            type = type.replaceAll(")", "").replaceAll(" ", "");
        else {
            type = name;
            name = trackInfo.parent ? trackInfo.parent.id : trackInfo.id;
        }
        trackInfo = {name, type};
        let tracks = this.tracksPerItem[name];

        for(let i = 0; i < tracks.length; i++) {
            if(tracks[i].type == type || tracks.length == 1){
                let oldState = tracks[i].active;
                tracks[i].active = visible;
                trackInfo = tracks[i];
    
                if(this.onChangeTrackVisibility)
                    this.onChangeTrackVisibility(trackInfo, oldState);

                break;
            }
        }

    }

    /**
    * @method changeTrackDisplay
    * @param {id, parent, children, display} trackInfo 
    */

    changeTrackDisplay(trackInfo, hide) {

        for(let idx = 0; idx < trackInfo.children.length; idx++) {
            let [name, type] = trackInfo.children[idx].id.split(" (");
            if(type)
                type = type.replaceAll(")", "").replaceAll(" ", "");
            else {
                type = name;
                name = trackInfo.parent ? trackInfo.parent.id : trackInfo.id;
            }
            //trackInfo = {name, type};
            let tracks = this.tracksPerItem[name];

            for(let i = 0; i < tracks.length; i++) {
                if(tracks[i].type != type && tracks.length > 1)
                    continue;
                    this.tracksPerItem[name][i].hide = hide;
              //      trackInfo = this.tracksPerItem[name][i];
            }
        }
        
        if(this.onChangeTrackDisplay)
            this.onChangeTrackDisplay(trackInfo, hide)
    }

    /**
     * @method resize
     * @param {*} size
     * 
     * 
     */
    resize( size = [this.root.parent.root.clientWidth, this.root.parent.root.clientHeight]) {

        // this.root.root.style.width = size[0] + "px";
        // this.root.root.style.height = size[1] + "px";
        
        this.size = size; 
        //this.content_area.setSize([size[0], size[1] - this.header_offset]);
        this.content_area.root.style.height = "calc(100% - "+ this.header_offset + "px)";

        let w = size[0] - this.leftPanel.root.clientWidth - 8;
        this.resizeCanvas([w , size[1]]);     
    }

    resizeCanvas( size ) {
        if( size[0] <= 0 && size[1] <=0 )
            return;
        if(Math.abs(this.canvas.width - size[0]) > 1) {
            
            var w = Math.max(300, size[0] );
            this.secondsToPixels = ( w- this.session.left_margin ) / this.duration;
            this.pixelsToSeconds = 1 / this.secondsToPixels;
        }
        size[1] -= this.header_offset;
        this.canvas.width = this.canvasArea.root.clientWidth;
        this.canvas.height = this.canvasArea.root.clientHeight;
    }

    /**
    * @method hide
    * Hide timeline area
    */
    hide() {
        this.root.hide();
    }

    /**
    * @method show
    * Show timeline area if it is hidden
    */
    show() {
        
        this.root.show();
        this.updateLeftPanel();
        this.resize();        
    }
};

Timeline.BACKGROUND_COLOR = LX.getThemeColor("global-color-primary");
Timeline.TRACK_COLOR_PRIMARY = LX.getThemeColor("global-blur-background");
Timeline.TRACK_COLOR_SECONDARY = LX.getThemeColor("global-color-terciary");
Timeline.TRACK_SELECTED = LX.getThemeColor("global-selected");
Timeline.TRACK_SELECTED_LIGHT = LX.getThemeColor("global-selected-light");
Timeline.FONT = LX.getThemeColor("global-font");
Timeline.FONT_COLOR = LX.getThemeColor("global-text");
Timeline.COLOR = LX.getThemeColor("global-selected-dark");//"#5e9fdd";
Timeline.COLOR_SELECTED = Timeline.COLOR_HOVERED = "rgba(250,250,20,1)";///"rgba(250,250,20,1)";
// Timeline.COLOR_HOVERED = LX.getThemeColor("global-selected");
Timeline.COLOR_INACTIVE = "rgba(250,250,250,0.7)";
Timeline.COLOR_LOCK = "rgba(255,125,125,0.7)";
Timeline.COLOR_EDITED = "rgba(20,230,20,0.7)"//"rgba(125,250,250, 1)";

LX.Timeline = Timeline;

/**
 * @class KeyFramesTimeline
 */

class KeyFramesTimeline extends Timeline {       

    /**
     * @param {string} name 
     * @param {object} options = {animationClip, selectedItems, x, y, width, height, canvas, trackHeight}
     */
    constructor(name, options = {}) {

        super(name, options);
        
        this.tracksPerItem = {};
        
        // this.selectedItems = selectedItems;
        this.autoKeyEnabled = false;


        if(this.animationClip && this.animationClip.tracks.length) {
            this.processTracks(this.animationClip);
        }
    }

    onMouseUp( e, time )  {

        let track = e.track;
        let localX = e.localX;
        let discard = e.discard;
        
        if(e.shiftKey) {
            e.multipleSelection = true;
            // Multiple selection
            if(!discard && track) {
                this.processCurrentKeyFrame( e, null, track, localX, true ); 
            }
            // Box selection
            else if(this.boxSelectionEnd) {
        
                this.unSelectAllKeyFrames();
                
                let tracks = this.getTracksInRange(this.boxSelectionStart[1], this.boxSelectionEnd[1], this.pixelsToSeconds * 5);
                
                for(let t of tracks) {
                    let keyFrameIndices = this.getKeyFramesInRange(t, 
                        this.xToTime( this.boxSelectionStart[0] ), 
                        this.xToTime( this.boxSelectionEnd[0] ),
                        this.pixelsToSeconds * 5);
                        
                    if(keyFrameIndices) {
                        for(let index = keyFrameIndices[0]; index <= keyFrameIndices[1]; ++index){
                            this.processCurrentKeyFrame( e, index, t, null, true );
                        }
                    }
                }
            }

        }else {
            // Check exact track keyframe
            if(discard || !track) {
                this.unSelectAllKeyFrames();               
            } 
        }

        this.canvas.classList.remove('grabbing');
        this.boxSelection = false;
        this.boxSelectionStart = null;
        this.boxSelectionEnd = null;
    }

    onMouseDown( e, time ) {
        let localX = e.localX;
        let localY = e.localY;
        let track = e.track;

        if(e.shiftKey) {

            this.boxSelection = true;
            this.boxSelectionStart = [localX, localY - this.topMargin];
            e.multipleSelection = true;
        }
        else if(track && !track.locked) {
            const keyFrameIndex = this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );
            if( keyFrameIndex > -1 ) {
                this.processCurrentKeyFrame( e, keyFrameIndex, track, null, e.multipleSelection ); // Settings this as multiple so time is not being set
                if(e.ctrlKey ) {

                    this.movingKeys = true;
                    this.canvas.style.cursor = "grab";  
                    this.canvas.classList.add('grabbing');
                }
                // Set pre-move state
                for(let selectedKey of this.lastKeyFramesSelected) {
                    let [name, idx, keyIndex] = selectedKey;
                    let trackInfo = this.tracksPerItem[name][idx];
                    selectedKey[3] = this.animationClip.tracks[ trackInfo.clipIdx ].times[ keyIndex ];
                }
                
                this.timeBeforeMove = track.times[ keyFrameIndex ];
            }
        }
        else if(!track) {
            this.unSelectAllKeyFrames()           
        }
    }

    onMouseMove( e, time ) {
        
        let localX = e.localX;
        let localY = e.localY;
        let track = e.track;

        // Manage keyframe movement
        if(this.movingKeys) {

            this.clearState();
            const newTime = this.xToTime( localX );
            
            // first, update times of the selected frames
            for(let [name, idx, keyIndex, keyTime] of this.lastKeyFramesSelected) {
                track = this.tracksPerItem[name][idx];
                if(track && track.locked)
                    continue;

                this.canvas.style.cursor = "grabbing";

                const delta = this.timeBeforeMove - keyTime;
                this.animationClip.tracks[ track.clipIdx ].times[ keyIndex ] = Math.min( this.animationClip.duration, Math.max(0, newTime - delta) );
            }
            
            // second, reorder track keyframes if necessary
            // for(let [name, idx, keyIndex, keyTime] of this.lastKeyFramesSelected) {
            for( let i = 0; i < this.lastKeyFramesSelected.length; ++i ){
                let s = this.lastKeyFramesSelected[i]; // pointer
                let name = s[0], localTrackIdx = s[1], keyTime = s[3];
                track = this.tracksPerItem[name][localTrackIdx];
                if(track && track.locked)
                    continue;

                let times = track.times;
                let k = s[2];
                for( ; k > 0; --k ){
                    if ( times[k-1] < times[k] ){ 
                        break; 
                    }
                    this.swapKeyFrames(track, k-1, k);
                }
                for( ; k < track.times.length-1; ++k ){
                    if ( times[k+1] > times[k] ){ 
                        break; 
                    }
                    this.swapKeyFrames(track, k+1, k);
                }
                s[2] = k; // "s" is a pointer. Modify selected keyFrame index
            }

            return;
        }

        if( this.grabbing && e.button != 2) {

        }
        else if(track) {

            this.unHoverAll();
            let keyFrameIndex = this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );
            if(keyFrameIndex > -1 ) {
                
                const name = this.tracksDictionary[track.fullname]; 
                let t = this.tracksPerItem[ name ][track.idx];
                if(t && t.locked)
                    return;
                
                this.lastHovered = [name, track.idx, keyFrameIndex];
                t.hovered[keyFrameIndex] = true;   
            }
        }
        else {
            this.unHoverAll();
        }
    }

    showContextMenu( e ) {

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
                            this.pasteKeyFrameValue(null, this.tracksPerItem[id][trackIdx], keyIdx);
                        }
                    }
                )
            }
            actions.push(
                {
                    title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                    callback: () => {
                        this.copyContent(); // copy value and keyframes selected
                    }
                }
            )
            actions.push(
                {
                    title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                    callback: () => {
                        this.deleteKeyFrame({}); // TODO multipleSelection
                    }
                }
            )
        }
        else{
            
            actions.push(
                {
                    title: "Add",
                    callback: () => this.addKeyFrame( e.track )
                }
            )

            if(this.clipboard && this.clipboard.keyframes)
            {
                actions.push(
                    {
                        title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => {
                            this.pasteContent();
                    
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

    drawContent( ctx, timeStart, timeEnd ) {
    
        if(!this.animationClip || this.selectedItems == null || !this.tracksPerItem) 
            return;
        
        ctx.save();
        this.scrollableHeight = this.topMargin;

        let offset = this.trackHeight;
        for(let t = 0; t < this.selectedItems.length; t++) {
            let tracks = this.tracksPerItem[this.selectedItems[t]] ? this.tracksPerItem[this.selectedItems[t]] : [{name: this.selectedItems[t]}];
            if(!tracks) continue;
            
            const height = this.trackHeight;
            this.scrollableHeight += (tracks.length+1)*height;
            let	scroll_y = - this.currentScrollInPixels;

            let offsetI = 0;
            for(let i = 0; i < tracks.length; i++) {
                let track = tracks[i];
                if(track.hide) {
                    continue;
                }
                this.drawTrackWithKeyframes(ctx, offsetI * height + offset + scroll_y, height, track.name + " (" + track.type + ")", this.animationClip.tracks[track.clipIdx], track);
                offsetI++;
            }
            offset += offsetI * height + height;
        }
         
        ctx.restore();
    };

    onUpdateTracks ( keyType ) {
    
        if(this.selectedItems == null || this.lastKeyFramesSelected.length || !this.autoKeyEnabled)
            return;

        for(let i = 0; i < this.selectedItems.length; i++) {
            let tracks = this.tracksPerItem[this.selectedItems[i]];
            if(!tracks) continue;

            // Get current track
            const selectedTrackIdx = tracks.findIndex( t => t.type === keyType );
            if(selectedTrackIdx < 0)
                return;
            let track = tracks[ selectedTrackIdx ];
            
            // Add new keyframe
            const newIdx = this.addKeyFrame( track );
            if(newIdx === null) 
                continue;

            // Select it
            this.lastKeyFramesSelected.push( [track.name, track.idx, newIdx, track.clipIdx] );
            track.selected[newIdx] = true;

        }
        //LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime );
        // Update time
        if(this.onSetTime)
            this.onSetTime(this.currentTime);

        return true; // Handled
    }

    // Creates a map for each item -> tracks
    processTracks(animation) {

        this.tracksPerItem = {};
        this.tracksDictionary = {};
        this.animationClip = {
            name: (animation && animation.name) ? animation.name : "animationClip",
            duration: animation ? animation.duration : 0,
            speed: (animation && animation.speed ) ? animation.speed : this.speed,
            tracks: []
        };
        if (animation && animation.tracks) {
            for( let i = 0; i < animation.tracks.length; ++i ) {
                
                let track = animation.tracks[i];
                
                const [name, type] = this.getTrackName(track.name);
                
                let valueDim = track.dim;
                if ( !valueDim || valueDim < 0 ){
                    if ( track.times.length && track.values.length ){ valueDim = track.values.length/track.times.length; }
                    else{ valueDim = 1; }
                }

                let leftOver = track.values.length % valueDim; // just in case values has an incorrect length
                let amounEntries = Math.min( track.times.length, track.values.length - leftOver );
                let times = track.times.slice(0, amounEntries); 
                let values = track.values.slice(0, amounEntries * valueDim);
                let boolArray = (new Array(amounEntries)).fill(false);

                let trackInfo = {
                    fullname: track.name,
                    name: name, type: type,
                    active: true,
                    locked: false,
                    dim: valueDim,
                    selected: boolArray.slice(), edited: boolArray.slice(), hovered: boolArray.slice(), 
                    times: times,
                    values: values
                };
                
                if(!this.tracksPerItem[name]) {
                    this.tracksPerItem[name] = [trackInfo];
                }else {
                    this.tracksPerItem[name].push( trackInfo );
                }
                
                
                const trackIndex = this.tracksPerItem[name].length - 1;
                trackInfo.idx = trackIndex; // index of track in "name"
                trackInfo.clipIdx = i; // index of track in the entire animation
                
                // Save index also in original track
                track.idx = trackIndex;
                this.tracksDictionary[track.name] = name; // map original track name with shortened one
                
                this.animationClip.tracks.push(trackInfo);
            }
        }
        this.resize();
    }

    /**
     * updates an existing track with new values and times.
     * @param {Integer} trackIdx index of track in the animationClip 
     * @param {*} newTrack object with two arrays: values and times. These will be set to the selected track
     * @returns 
     */
    updateTrack(trackIdx, newTrack) {
        if(!this.animationClip)
            return false;

        const track = this.animationClip.tracks[trackIdx]; 
        track.values = newTrack.values;
        track.times = newTrack.times;

        track.selected = (new Array(track.times.length)).fill(false);
        track.hovered = track.selected.slice();
        track.edited = track.selected.slice();
        return true;
    }

    /**
     * removes equivalent sequential keys either because of equal times or values
     * (0,0,0,0,1,1,1,0,0,0,0,0,0,0) --> (0,0,1,1,0,0)
     * @param {Int} trackIdx index of track in the animation
     * @param {Bool} onlyEqualTime if true, removes only keyframes with equal times. Otherwise, values are ALSO compared through the class threshold
     * @param {Bool} enableEvent if true, triggers "onOptimizeTracks" after optimizing
     */
    optimizeTrack(trackIdx, onlyEqualTime = false, enableEvent = true ) {
        if ( !this.animationClip ){ return; }

        const track = this.animationClip.tracks[trackIdx],
            times = track.times,
            values = track.values,
            stride = track.dim,
            threshold = this.optimizeThreshold;
        let cmpFunction = (v, p, n, t) => { return Math.abs(v - p) >= t || Math.abs(v - n) >= t };
        let lastSavedIndex = 0;
        const lastIndex = times.length-1;

        for ( let i = 1; i < lastIndex; ++ i ) {

            let keep = false;
            const time = times[ i ];
            const timePrev = times[ lastSavedIndex ];

            // remove adjacent keyframes scheduled at the same time
            if ( time !== timePrev ) {
                if ( ! onlyEqualTime ) {
                    // remove unnecessary keyframes same as their neighbors
                    const offset = i * stride,
                        offsetP = lastSavedIndex * stride,
                        offsetN = offset + stride;

                    for ( let j = 0; j !== stride; ++ j ) {
                        if( cmpFunction(
                            values[ offset + j ], 
                            values[ offsetP + j ], 
                            values[ offsetN + j ],
                            threshold))
                        {
                            keep = true;
                            break;
                        }
                    }
                } else {
                    keep = true;
                }
            }

            // in-place compaction
            if ( keep ) {
                ++lastSavedIndex;
                if ( i !== lastSavedIndex ) {
                    times[ lastSavedIndex ] = times[ i ];
                    const readOffset = i * stride,
                        writeOffset = lastSavedIndex * stride;
                    for ( let j = 0; j !== stride; ++ j ) {
                        values[ writeOffset + j ] = values[ readOffset + j ];
                    }
                }
            }
        }

        // add last frame. first and last keyframes should be always kept
        if ( times.length > 1 ) {
            ++lastSavedIndex;
            times[ lastSavedIndex ] = times[ times.length - 1 ];
            const readOffset = values.length - stride,
                writeOffset = lastSavedIndex * stride;
            for ( let j = 0; j !== stride; ++j ) {
                values[ writeOffset + j ] = values[ readOffset + j ];
            }
        }
        
        // commit changes
        if ( lastSavedIndex < times.length-1 ) {   
            track.times = times.slice( 0, lastSavedIndex + 1 );
            track.values = values.slice( 0, (lastSavedIndex + 1) * stride );
            this.updateTrack( track.clipIdx, track ); // update control variables (hover, edited, selected) 
        } 

        if(this.onOptimizeTracks && enableEvent )
            this.onOptimizeTracks(trackIdx);
    }

    optimizeTracks(onlyEqualTime = false) {

        if(!this.animationClip)
            return;

        for( let i = 0; i < this.animationClip.tracks.length; ++i ) {
            const track = this.animationClip.tracks[i];
            this.optimizeTrack( track.clipIdx, onlyEqualTime, false );
        }

        if(this.onOptimizeTracks )
            this.onOptimizeTracks(-1); // signal as "all tracks"
    }


    getNumTracks( item ) {
        if(!item || !this.tracksPerItem)
            return;
        const tracks = this.tracksPerItem[item.name];
        return tracks ? tracks.length : null;
    }


    onShowOptimizeMenu( e ) {
        
        if(this.selectedItems == null)
            return;

        let tracks = [];
        for(let i = 0; i < this.selectedItems.length; i++) {

            tracks = [...tracks, ...this.tracksPerItem[this.selectedItems[i]]];
            if(!tracks) continue;

        }
        if(!tracks.length) return;

        const threshold = this.onGetOptimizeThreshold ? this.onGetOptimizeThreshold() : 0.025;
        LX.addContextMenu("Optimize", e, m => {
            for( let t of tracks ) {
                m.add( t.name + (t.type ? "@" + t.type : ""), () => { 
                    this.optimizeTrack( t.clipIdx, false);
                })
            }
        });
    }

    isKeyFrameSelected( track, index ) {
        return track.selected[ index ];
    }

    /**
     * @param {Number} trackIdx index of track in the animation (not local index) 
     */
    saveState( trackIdx ) {
        const trackInfo = this.animationClip.tracks[trackIdx];
        this.trackState.push({
            idx: trackIdx,
            t: trackInfo.times.slice(),
            v: trackInfo.values.slice(),
            editedTracks: [].concat(trackInfo.edited)
        });
    }

    undo() {
        
        if(!this.trackState.length)
        return;

        const state = this.trackState.pop();
        this.animationClip.tracks[state.idx].times = state.t;
        this.animationClip.tracks[state.idx].values = state.v;

        const localIdx = this.animationClip.tracks[state.idx].idx;
        const name = this.getTrackName(this.animationClip.tracks[state.idx].name)[0];
        this.tracksPerItem[name][localIdx].edited = state.editedTracks;

        // Update animation action interpolation info
        if(this.onUpdateTrack)
            this.onUpdateTrack( state.idx );
    }

    /**
    * 
    * @param {*} track 
    * @param {Number} srcIdx keyFrame index
    * @param {Number} trgIdx keyFrame index  
    */
    swapKeyFrames(track, srcIdx, trgIdx){
        let times = track.times;
        let values = track.values;

        let tmp = times[srcIdx];
        times[srcIdx] = times[trgIdx];
        times[trgIdx] = tmp;

        tmp = track.hovered[srcIdx];
        track.hovered[srcIdx] = track.hovered[trgIdx];
        track.hovered[trgIdx] = tmp;

        tmp = track.edited[srcIdx];
        track.edited[srcIdx] = track.edited[trgIdx];
        track.edited[trgIdx] = tmp;

        tmp = track.selected[srcIdx];
        track.selected[srcIdx] = track.selected[trgIdx];
        track.selected[trgIdx] = tmp;

        let src = srcIdx * track.dim;
        let end = src + track.dim;
        let trg = trgIdx * track.dim;
        for( ; src < end; ++src ){
            tmp = values[ src ];
            values[ src ] = values[ trg ];
            values[ trg ] = tmp;
            ++trg;
        }
    }

    /**
     * @param {object} track track of animation clip (object not index)
     * @param {int} frameIdx frame (index) to select inside the track 
     * @param {bool} unselectPrev if true, unselects previously selected frames. Otherwise, stacks the new selection
     * @returns 
     */
    selectKeyFrame( track, frameIdx, unselectPrev = true ) {
        if( frameIdx == undefined || !track || track.locked || !track.active )
            return false;
    
        if ( unselectPrev ){
            this.unSelectAllKeyFrames();
        }

        this.lastKeyFramesSelected.push( [track.name, track.idx, frameIdx, track.clipIndex] );
        track.selected[frameIdx] = true;

        return true;
    }

    copyContent() {
        if (!this.lastKeyFramesSelected.length){ 
            return; 
        }
        
        // sort keyframes selected by track
        let toCopy = {};
        for(let i = 0; i < this.lastKeyFramesSelected.length; i++){
            let [id, localTrackIdx, keyIdx] = this.lastKeyFramesSelected[i];
            let track = this.tracksPerItem[id][localTrackIdx];
            let trackIdx = track.clipIdx;

            if(toCopy[trackIdx]) {
                toCopy[trackIdx].idxs.push(keyIdx);
            } else {
                toCopy[trackIdx] = {track: track, idxs : [keyIdx]};
            }
            if(i == 0) {
                this.copyKeyFrameValue(track, keyIdx);
            }
        }

        // for each track selected, copy its values
        for(let trackIdx in toCopy) {
            this.copyKeyFrames(toCopy[trackIdx].track, toCopy[trackIdx].idxs);
        }
    }

    // copies the current value of the keyframe. This value can be pasted across any track (as long as they are of the same type)
    copyKeyFrameValue( track, index ) {

        // 1 element clipboard by now
        let start = index * track.dim;
        let values = this.animationClip.tracks[ track.clipIdx ].values.slice(start, start + track.dim);

        if(!this.clipboard)
            this.clipboard = {};

        this.clipboard.value = {
            type: track.type,
            values: values
        };
    }

    // each track will have its own entry of copied keyframes. When pasting, only the apropiate track's keyframes are pasted
    copyKeyFrames( track, indices ) {

        let trackIdx = track.clipIdx;
        if(!this.clipboard)
            this.clipboard = {};
        if(!this.clipboard.keyframes) {
            this.clipboard.keyframes = {};
        }
        
        this.clipboard.keyframes[trackIdx] = { track: track, values:{}, times:{} };

        // 1 element clipboard by now
        for(let i = 0; i < indices.length; i++ ){
            let keyIdx = indices[i];
            let start = keyIdx * track.dim;
            let keyValues = track.values.slice(start, start + track.dim); // copy values into a new array
            this.clipboard.keyframes[trackIdx].values[keyIdx] = keyValues; // save to clipboard
            this.clipboard.keyframes[trackIdx].times[keyIdx] = track.times[keyIdx]; // save to clipboard
        };
    }

    pasteContent() {
        if(!this.clipboard)
            return;
        
        // copy the value into the only selected keyframe
        if(this.clipboard.value && this.lastKeyFramesSelected.length == 1) {

            let [id, localTrackIdx, keyIdx] = this.lastKeyFramesSelected[0];
            this.pasteKeyFrameValue({}, this.tracksPerItem[id][localTrackIdx], keyIdx);
        }

        // create new keyframes from the ones copied 
        if(this.clipboard.keyframes) {
            let currentTime = this.currentTime;
            for(let trackIdx in this.clipboard.keyframes) {
                this.pasteKeyFrames({multipleSelection: this.clipboard.keyframes.length}, trackIdx);
                this.currentTime = currentTime;
            }
        }
    }

    canPasteKeyFrame () {
        return this.clipboard != null;
    }

    #paste( track, index ) {

        let clipboardInfo = this.clipboard.value;

        if(clipboardInfo.type != track.type){
            return;
        }

        let start = index * track.dim;
        let j = 0;
        for(let i = start; i < start + track.dim; ++i) {
            this.animationClip.tracks[ track.clipIdx ].values[i] = clipboardInfo.values[j];
            ++j;
        }
        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        track.edited[ index ] = true;
    }

    pasteKeyFrameValue( e, track, index ) {

        this.saveState(track.clipIdx);

        // Copy to current key
        this.#paste( track, index );
        
        if(!e || !e.multipleSelection){
            return;
        }
        
        // Don't want anything after this
        this.clearState();

        // Copy to every selected key
        for(let [name, localTrackIdx, keyIndex] of this.lastKeyFramesSelected) {
            this.#paste( this.tracksPerItem[name][localTrackIdx], keyIndex );
        }
    }

    pasteKeyFrames( e, trackIdx ) {
        
        if ( !this.clipboard.keyframes[trackIdx] ){
            return;
        }
        this.saveState(trackIdx);

        let clipboardInfo = this.clipboard.keyframes[trackIdx];
        let indices = Object.keys(clipboardInfo.values);
        indices.sort(); // just in case

        // Copy to current key
        for(let i = 0; i < indices.length; i++) {
            let value = clipboardInfo.values[indices[i]];
            if(typeof value == 'number')
                value = [value];
            if(i > 0) {
                let delta = clipboardInfo.times[indices[i]] - clipboardInfo.times[indices[i-1]];
                this.currentTime += delta;
            }
            this.addKeyFrame( clipboardInfo.track, value );
        }
    }

    addKeyFrame( track, value = undefined, time = this.currentTime ) {

        if(!track) {
            return -1;
        }

        // Update animationClip information
        const clipIdx = track.clipIdx;
        track = this.animationClip.tracks[clipIdx];

        let newIdx = this.getNearestKeyFrame( track, time ); 
        
        // Time slot with other key?
        if( newIdx > -1 && Math.abs(track.times[newIdx] - time) < 0.001 ) {
            console.warn("There is already a keyframe [", newIdx, "] stored in time slot [", track.times[newIdx], "]");
            return -1;
        }

        this.saveState(clipIdx);

        // Find index that t[idx] > time
        if(newIdx < 0) { 
            newIdx = 0;
        }
        else if ( track.times[newIdx] < time ){ 
            newIdx++; 
        }

        // TODO allow undefined value and compute the interpolation between adjacent keyframes?

        // new arrays
        let times = new Float32Array( track.times.length + 1 );
        let values = new Float32Array( track.values.length + track.dim );

        let valueDim = track.dim;

        // copy times/values before the new index
        for( let i = 0; i < newIdx; ++i ){ 
            times[i] = track.times[i]; 
        }
        for( let i = 0; i < newIdx * valueDim; ++i ){ 
            values[i] = track.values[i]; 
        }

        // new keyframe
        times[newIdx] = time;
        for( let i = 0; i < valueDim; ++i ){ 
            values[newIdx * valueDim + i] = value[i]; 
        }

        // copy remaining keyframes
        for( let i = newIdx; i < track.times.length; ++i ){ 
            times[i+1] = track.times[i]; 
        }
        for( let i = newIdx * valueDim; i < track.values.length; ++i ){ 
            values[i + valueDim] = track.values[i]; 
        }

        // update track pointers
        track.times = times;
        track.values = values;
                    
        // Add new entry into each control array
        track.hovered.splice(newIdx, 0, false);
        track.selected.splice(newIdx, 0, false);
        track.edited.splice(newIdx, 0, true);
    
        // Update animation action interpolation info
        if(this.onUpdateTrack)
            this.onUpdateTrack( clipIdx );

        LX.emit( "@on_current_time_" + this.constructor.name, time);
        // if(this.onSetTime)
        //     this.onSetTime(time);
        return newIdx;
    }

    deleteContent() {
        
        this.deleteKeyFrame({ multipleSelection: this.lastKeyFramesSelected.length > 1});
    }

    /**
    * Delete a keyframe given the track and the its index
    * @param {Number} trackIdx track that keyframe belongs to 
    * @param {Number} index index of the keyframe on the track
    * @returns 
    */
    #delete( trackIdx, index ) {
        
        const track = this.animationClip.tracks[trackIdx];

        // Don't remove by now the first key (and avoid impossible indices)
        if(index < 1 || index >= track.times.length ) {
            console.warn("Operation not supported! " + (index==0 ?"[removing first keyframe track]":"[removing invalid keyframe " + i + " from " + track.times.length + "]"));
            return false;
        }

        // Delete time key (TypedArrays do not have splice )
        track.times = track.times.filter( (v, i) => i != index);
        track.edited = track.edited.filter( (v, i) => i != index);
        track.selected = track.selected.filter( (v, i) => i != index);
        track.hovered = track.hovered.filter( (v, i) => i != index);

        // Delete values
        const indexDim = track.dim * index;
        const slice1 = track.values.slice(0, indexDim);
        const slice2 = track.values.slice(indexDim + track.dim);

        track.values = LX.UTILS.concatTypedArray([slice1, slice2], Float32Array);

        // // Move the other's key properties
        // for(let i = index; i < track.times.length; ++i) {
        //     track.edited[i] = track.edited[i + 1];
        //     track.hovered[i] = track.hovered[i + 1];
        //     track.selected[i] = track.selected[i + 1];
        // }

        // Update animation action interpolation info
        if(this.onDeleteKeyFrame)
            this.onDeleteKeyFrame( trackIdx, index );
        
        return true;
    }

    /** Delete one or more keyframes given the triggered event
     * @e: event
     * @track:
     * @index: index of the keyframe on the track
    */
    deleteKeyFrame(e, track, index) {
        
        if(e.multipleSelection) {

            // Split in tracks
            const perTrack = [];
            this.lastKeyFramesSelected.forEach( e => perTrack[e[1]] ? perTrack[e[1]].push(e) : perTrack[e[1]] = [e] );
            
            for(let pts of perTrack) {
                
                if(!pts) continue;

                pts = pts.sort( (a,b) => b[2] - a[2] ); // sort by keyframe index (descending)

                // Delete every selected key starting with the last one in the track
                for(let [name, localIdx, keyIndex] of pts) {
                    let track = this.tracksPerItem[name][localIdx];
                    this.saveState(track.clipIdx); 
                    this.#delete(track.clipIdx, keyIndex);
                }
            }
        }
        else{

            // Key pressed
            if(!track && this.lastKeyFramesSelected.length > 0) {
                const [itemName, localTrackIndex, keyIndex] = this.lastKeyFramesSelected[0];
                track = this.tracksPerItem[itemName][localTrackIndex];
                index = keyIndex;
            }

            if ( track ){
                this.saveState(track.clipIdx);
                this.#delete(track.clipIdx, index);
            }
        }

        this.unSelectAllKeyFrames();
    }

    getNumKeyFramesSelected() {
        return this.lastKeyFramesSelected.length;
    }
    

    unSelect() {

        if(!this.unSelectAllKeyFrames()) {
            this.selectedItems = null;
            if(this.onItemUnselected)
                this.onItemUnselected();
        }
    }

    /**
     * @param {Array} itemsName 
     */
    setSelectedItems( itemsName ) {

        if(itemsName.constructor !== Array)
        throw("Item name has to be an array!");

        this.selectedItems = itemsName;
        this.unSelectAllKeyFrames();
        this.updateLeftPanel();
        this.resize();
    }

    getTrack( trackInfo )  {
        const [name, trackIndex] = trackInfo;
        return this.tracksPerItem[ name ][trackIndex];
    }

    getTrackName( uglyName ) {

        let name, type;

        // Support other versions
        if(uglyName.includes("[")) {
            const nameIndex = uglyName.indexOf('['),
                trackNameInfo = uglyName.substr(nameIndex+1).split("].");
            name = trackNameInfo[0];
            type = trackNameInfo[1];
        }else {
            const trackNameInfo = uglyName.split(".");
            name = trackNameInfo[0];
            type = trackNameInfo[1];
        }

        return [name, type];
    }


    /**
     * Binary search. Relies on track.times being a sorted array
     * @param {object} track 
     * @param {number} time 
     * @param {number} mode on of the possible values 
     *  - -1 = nearest frame with t[f] <= time 
     *  - 0 = nearest frame 
     *  - 1 = nearest frame with t[f] >= time
     * @returns a zero/positive value if successful. On failure returnes -1 meaning either there are no frames (0), no frame-time is lower (-1) or no frame-time is higher (1)
     */
    getNearestKeyFrame( track, time, mode = 0 ) {

        if(!track || !track.times || !track.times.length)
            return -1;

        //binary search
        const times = track.times;
        let min = 0, max = times.length - 1;
        
        // edge cases
        if ( times[min] > time ){
            return mode == -1 ? -1 : 0;
        }
        if ( times[max] < time ){
            return mode == 1 ? -1 : max;
        }
        
        // time is between first and last frame
        let half = Math.floor( ( min + max ) / 2 );
        while ( min < half && half < max ){
            if ( time < times[half] ){ max = half; }
            else{ min = half; }
            half = Math.floor( ( min + max ) / 2 );
        }

        if (mode == 0 ){
            return Math.abs( time - times[min] ) < Math.abs( time - times[max] ) ? min : max;
        }
        else if ( mode == -1 ){
            return times[max] == time ? max : min;
        }
        return times[min] == time ? min : max;
    }

    /**
     * get the nearest keyframe to "time" given a maximum threshold. 
     * @param {object} track 
     * @param {number} time 
     * @param {number} threshold must be positive value
     * @returns returns a postive/zero value if there is a frame inside the threshold range. Otherwise, -1
     */
    getCurrentKeyFrame( track, time, threshold = 0.0 ) {

        if(!track || !track.times.length)
            return -1;

        let frame = this.getNearestKeyFrame( track, time );
        if ( frame > -1 ){
            frame = Math.abs(track.times[frame] - time) > threshold ? -1 : frame;
        }

        return frame;
    }

    /**
     * Returns the interval of frames between minTime and maxTime (both included)
     * @param {object} track 
     * @param {number} minTime 
     * @param {number} maxTime 
     * @param {number} threshold must be positive value 
     * @returns an array with two values [ minFrame, maxFrame ]. Otherwise null 
     */
    getKeyFramesInRange( track, minTime, maxTime, threshold = 0.0 ) {

        if(!track || !track.times.length)
            return null;

        // Manage negative selection
        if(minTime > maxTime) {
            let aux = minTime;
            minTime = maxTime;
            maxTime = aux;
        }

        const minFrame = this.getNearestKeyFrame( track, minTime - threshold, 1 );
        const maxFrame = this.getNearestKeyFrame( track, maxTime + threshold, -1 );

        if ( maxFrame == -1 || minFrame == -1 ){ return null; }

        return [minFrame, maxFrame];
    }

    unHoverAll(){
        if(this.lastHovered) {
            this.tracksPerItem[ this.lastHovered[0] ][ this.lastHovered[1] ].hovered[ this.lastHovered[2] ] = false;
        }
        let h = this.lastHovered;
        this.lastHovered = null;
        return h;
    }

    unSelectAllKeyFrames() {

        for(let [name, idx, keyIndex] of this.lastKeyFramesSelected) {
            this.tracksPerItem[name][idx].selected[keyIndex] = false;
        }

        // Something has been unselected
        const unselected = this.lastKeyFramesSelected.length > 0;
        this.lastKeyFramesSelected.length = 0;
        return unselected;
    }

    processCurrentKeyFrame( e, keyFrameIndex, track, localX, multiple ) {

        if(track.locked)
            return;

        e.multipleSelection = multiple;
        if(!multiple && e.button != 2) {
            this.unSelectAllKeyFrames();
        }

        keyFrameIndex = keyFrameIndex ?? this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );   
        if(keyFrameIndex < 0)
            return;

        const name = this.tracksDictionary[track.fullname];
        let t = this.tracksPerItem[ name ][track.idx];
        
        this.selectKeyFrame(t, keyFrameIndex, !multiple); // changes time 
        const currentSelection = this.lastKeyFramesSelected[ this.lastKeyFramesSelected.length - 1 ];

        if( this.onSelectKeyFrame && this.onSelectKeyFrame(e, currentSelection)) {
            // Event handled
            return;
        }        

        if( !multiple ) {
            this.currentTime = this.animationClip.tracks[t.clipIdx].times[ keyFrameIndex ];
            LX.emit( "@on_current_time_" + this.constructor.name, track.times[ keyFrameIndex ]);
        }    
    }

    /**
     * @method addNewTrack
     */

    addNewTrack() {

        if(!this.animationClip)
            this.animationClip = {tracks:[]};

        let trackInfo = {
            idx: this.animationClip.tracks.length,
            values: [], times: [],
            selected: [], edited: [], hovered: []
        };

        this.animationClip.tracks.push(trackInfo);
        this.updateLeftPanel();
        return trackInfo.idx;
    }

    /**
     * @method clearTrack
     */

    clearTrack(idx, defaultValue) {

        let track =  this.animationClip.tracks[idx];

        if(track.locked )
        {
            return;
        }

        const count = track.times.length;
        for(let i = count - 1; i >= 0; i--)
        {
            this.saveState(track.clipIdx);
            this.#delete(track.clipIdx, i );
        } 
        if(defaultValue != undefined) {
            if(typeof(defaultValue) == 'number')  {
                track.values[0] = defaultValue;
            }
            else {
                for(let i = 0; i < defaultValue.length; i++) {
                    track.values[i] = defaultValue[i];
                }
            }

        }
        return idx;
    }
}

LX.KeyFramesTimeline = KeyFramesTimeline;

/**
 * @class ClipsTimeline
 */

class ClipsTimeline extends Timeline {

    /**
     * @param {string} name 
     * @param {object} options = {animationClip, selectedItems, x, y, width, height, canvas, trackHeight}
     */
    constructor(name, options = {}) {

        super(name, options);
                    
        this.addNewTrack();
        this.lastClipsSelected = [];
    }

    updateLeftPanel(area) {

        let scrollTop = 0;
        if(this.leftPanel){
            scrollTop = this.leftPanel.root.children[1].scrollTop;
            this.leftPanel.clear();
        }
        else {
            this.leftPanel = area.addPanel({className: 'lextimelinepanel', width: "100%", height: "100%"});
        }

        let panel = this.leftPanel;
        
        panel.sameLine(2);
        let title = panel.addTitle("Tracks");
        if(!this.disableNewTracks) 
        {
            panel.addButton('', '<i class = "fa-solid fa-plus"></i>', (value, event) => {
                this.addNewTrack();
            }, {width: "40px", height: "40px"});            
        }
        panel.endLine();
        const styles = window.getComputedStyle(title);
        const titleHeight = title.clientHeight + parseFloat(styles['marginTop']) + parseFloat(styles['marginBottom']);
        let p = new LX.Panel({height: "calc(100% - " + titleHeight + "px)"});

        let treeTracks = [];
        if(this.animationClip)  {

            for(let i = 0; i < this.animationClip.tracks.length; i++ ) {
                let track = this.animationClip.tracks[i];
                treeTracks.push( {
                    'id': track.name ?? "Track_" + track.idx.toString(),
                    'name': track.name,
                    'skipVisibility': this.skipVisibility,     
                    'visible': track.active,  
                    // 'selected' : track.isSelected                
                } );
                              
            }

        }
        this.leftPanelTrackTree = p.addTree(null, treeTracks, {filter: false, rename: false, draggable: false, onevent: (e) => {
            switch(e.type) {
                case LX.TreeEvent.NODE_SELECTED:
                    this.selectTrack(e.node);
                    break;
                case LX.TreeEvent.NODE_VISIBILITY:    
                    this.changeTrackVisibility(e.node, e.value);
                    break;
                case LX.TreeEvent.NODE_CARETCHANGED:    
                    this.changeTrackDisplay(e.node, e.node.closed);
                    break;
            }
        }});
        panel.attach(p.root)
        p.root.style.overflowY = "scroll";
        p.root.addEventListener("scroll", (e) => {
            this.currentScroll = e.currentTarget.scrollTop / (e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
        })
       
        this.leftPanel.root.children[1].scrollTop = scrollTop;

        if(this.leftPanel.parent.root.classList.contains("hidden") || !this.root.root.parent)
            return;
        this.resizeCanvas([ this.root.root.clientWidth - this.leftPanel.root.clientWidth  - 8, this.size[1]]);
    }

    
    /**
    * @method changeTrackVisibility
    * @param {id, parent, children, visible} trackInfo 
    */

    changeTrackVisibility(trackInfo, visible) {
        let [name, type] = trackInfo.id.split(" (");
        if(type)
            type = type.replaceAll(")", "").replaceAll(" ", "");
        else {
            type = name;
            name = trackInfo.parent ? trackInfo.parent.id : trackInfo.id;
        }
        let id = name.split("Track_")[1];
        trackInfo = {name, type};
        let track = this.animationClip.tracks[id];
  
        let oldState = track.active;
        track.active = visible;
        trackInfo = track;
        
        if(this.onChangeTrackVisibility)
            this.onChangeTrackVisibility(trackInfo, oldState);
    }

    /**
    * @method selectTrack
    * @param {id, parent, children, visible} trackInfo 
    * // NOTE: to select a track from outside of the timeline, a this.leftPanelTrackTree.select(item) needs to be called. 
    */

    selectTrack( trackInfo) {
        this.unSelectAllTracks();
        
        let [name, type] = trackInfo.id.split(" (");
        
        if(type)
            type = type.replaceAll(")", "").replaceAll(" ", "");
        else {
            type = name;
            name = trackInfo.parent ? trackInfo.parent.id : trackInfo.id;
        }
        let id = name.split("Track_")[1];
        let track = this.animationClip.tracks[id];
        track.isSelected = true;
        
        trackInfo = track;
        if(this.onSelectTrack)
            this.onSelectTrack(trackInfo);
    }

    unSelectAllTracks() {
        
        for(let t = 0; t < this.animationClip.tracks.length; t++) {
            this.animationClip.tracks[t].isSelected = false;
        }    
    }

    unHoverAll(){
        if(this.lastHovered){
            this.animationClip.tracks[ this.lastHovered[0] ].hovered[ this.lastHovered[1] ] = false;
        }
        let h = this.lastHovered;
        this.lastHovered = null;
        return h;
    }

    onMouseUp( e ) {
        
        let track = e.track;
        let localX = e.localX;

        let discard = e.discard; // true when too much time has passed between Down and Up

        if(e.shiftKey) {

            // Manual Multiple selection
            if(!discard && track) {
                this.selectClip( track, null, localX, false );
            }
            // Box selection
            else if (this.boxSelection){
                
                let tracks = this.getTracksInRange(this.boxSelectionStart[1], this.boxSelectionEnd[1], this.pixelsToSeconds * 5);
                
                for(let t of tracks) {
                    let clipsIndices = this.getClipsInRange(t, 
                        this.xToTime( this.boxSelectionStart[0] ), 
                        this.xToTime( this.boxSelectionEnd[0] ),
                        this.pixelsToSeconds * 5);
                        
                    if(clipsIndices) {
                        for(let index of clipsIndices)
                            this.selectClip( t, index, null, false );
                    }
                }
            }

        }
        else {

            let boundingBox = this.canvas.getBoundingClientRect()
            if(e.y < boundingBox.top || e.y > boundingBox.bottom)
                return;

            // Check exact track clip
            if(!discard && track) {
                if(e.button!=2){
                    this.selectClip( track, null, localX );
                }
            } 
            
        }
        this.movingKeys = false;
        this.boxSelection = false;
        this.boxSelectionStart = null;
        this.boxSelectionEnd = null;

        }

    onMouseDown( e, time ) {

        let localX = e.localX;
        let localY = e.localY;
        let track = e.track;

        if(e.shiftKey) {

            this.boxSelection = true;
            this.boxSelectionStart = [localX, localY - this.topMargin];  
            this.boxSelectionEnd = [localX,localY - this.topMargin];

        }
        else if(e.ctrlKey && track) { // move clips
            
            let x = e.offsetX;
            let selectedClips = [];

            // clip selection is done on MouseUP
            selectedClips = this.lastClipsSelected;

            this.canvas.style.cursor = "grab";  
            for(let i = 0; i < selectedClips.length; i++)
            {
                this.movingKeys = false
                let [trackIndex, clipIndex] = selectedClips[i];
                const clip = this.animationClip.tracks[trackIndex].clips[clipIndex];

                let endingX = this.timeToX( clip.start + clip.duration );
            
                if(this.duration < clip.start + clip.duration  ){
                    this.setDuration(clip.start + clip.duration);
                }

                if(Math.abs( endingX - x ) < 5 ) {
                    this.dragClipMode = "duration";
                    this.canvas.style.cursor = "column-resize";
                }
                else {
                    this.dragClipMode = "move";
                }
            }
        }
        else if(!track || track && this.getCurrentContent(track, time, 0.001) == -1) { // clicked on empty space
            this.unSelectAllClips();
            if(this.onSelectClip)
                this.onSelectClip(null);
        }
        else if (track && (this.dragClipMode == "duration" || this.dragClipMode == "fadein" || this.dragClipMode == "fadeout" )) { // clicked while mouse was over fadeIn, fadeOut, duration
            this.selectClip( track, null, localX ); // select clip if any
        }
    }

    onMouseMove( e, time ) {

        if(e.shiftKey) {
            if(this.boxSelection) {
                this.boxSelectionEnd[0] = localX;
                this.boxSelectionEnd[1] = localY - this.topMargin;
                return; // Handled
            }
        }

        if(this.grabbing && e.button != 2) { // move clips
 
            let delta = time - this.grabTime;
            this.grabTime = time;
            if ( time < 0 && delta > 0 ){ delta = 0; }
           
            // if ( false && this.lastClipsSelected.length == 1 ){
            //     let clip = this.animationClip.tracks[this.lastClipsSelected[0][0]].clips[this.lastClipsSelected[0][1]];
            //     if( this.dragClipMode == "fadein" ) {
            //         clip.fadein = Math.min(Math.max((clip.fadein || 0) + delta, clip.start), clip.start+clip.duration);
            //     }
            //     else if( this.dragClipMode == "fadeout" ) {
            //         clip.fadeout = Math.max(Math.min((clip.fadeout || clip.start+clip.duration) + delta, clip.start+clip.duration), clip.start);
            //     }
            //     else if( this.dragClipMode == "duration" ) {
            //         clip.duration += delta;
            //         clip.fadeout = Math.max(Math.min((clip.fadeout || clip.start+clip.duration) + delta, clip.start+clip.duration), clip.start);
            //         if(this.duration < clip.start + clip.duration){
            //             this.setDuration(clip.start + clip.duration);
            //         }
            //     }
            //     if(this.onContentMoved) { // content changed
            //         this.onContentMoved(clip, 0);
            //     }
            // } 
            // else if ( this.lastClipsSelected.length ) {
            //     this.movingKeys = true;

            //     let leastDelta = delta;
            //     let isAllOrNothing = false;
            //     let moveAccepted = true;

            //     let trackStart = this.lastClipsSelected[0][0];
            //     let trackEnd = trackStart;
            //     for( let i = 0; i < this.lastClipsSelected.length; ++i ){
                    

            //         let trackIdx = this.lastClipsSelected[i][0];
            //         let clipIdx = this.lastClipsSelected[i][1];
            //         const trackClips = this.animationClip.tracks[trackIdx].clips;
            //         const clip = this.animationClip.tracks[trackIdx].clips[clipIdx];

            //         if ( delta >= 0 ){
            //             if ( trackClips.length-1 == clipIdx || trackClips[clipIdx + 1].start >= (clip.start+clip.duration+delta) ){ continue; } //has not reached next clip. Enough space
            //             const nextClip = trackClips[clipIdx + 1];
            //             leastDelta = Math.max( 0, Math.min( leastDelta,  nextClip.start - clip.start - clip.duration ) );
            //         }
            //         else if ( delta < 0 ){
            //             if ( clipIdx > 0 && (trackClips[clipIdx - 1].start + trackClips[clipIdx - 1].duration) <= (clip.start+delta) ){ continue; } // has not reached previous clip. Enough space
            //             if( clipIdx > 0 ){
            //                 const prevClip = trackClips[clipIdx - 1];
            //                 leastDelta = Math.min( 0, Math.max( leastDelta,  prevClip.start + prevClip.duration - clip.start ) ); // delta should be negative, that is why the least is the max
            //             }
            //             if ( clip.start + delta < 0 ){ 
            //                 leastDelta = Math.max(leastDelta, -clip.start);
            //                 isAllOrNothing = true; 
            //                 moveAccepted = false; 
            //                 continue; // keep searching for the leastDelta
            //             }
            //         }

            //         if( !moveAccepted ){ continue; }
            //         isAllOrNothing = true;
            //         let clipsInRange = this.getClipsInRange(this.animationClip.tracks[trackIdx], clip.start + delta, clip.start + clip.duration + delta, 0.01); 
            //         if ( clipsInRange && (clipsInRange[0] != clipIdx || clipsInRange[clipsInRange.length-1] != clipIdx)){
            //             moveAccepted = false;

            //         }
            //     }

            //     // update all start,fadein,fadeout 
            //     // if !isAllOrNothing -> use full delta
            //     // if isAllOrNothing && moveAccepted -> use full delta
            //     // if isAllOrnothing && !moveAccepted -> use leastDelta

            //     if ( !isAllOrNothing || moveAccepted ){ leastDelta = delta; }
            //     this.grabTime = time - delta + leastDelta;

            //     for( let i = 0; i < this.lastClipsSelected.length; ++i ){
            //         let trackIdx = this.lastClipsSelected[i][0];
            //         let clipIdx = this.lastClipsSelected[i][1];
            //         const trackClips = this.animationClip.tracks[trackIdx].clips;
            //         const clip = this.animationClip.tracks[trackIdx].clips[clipIdx];
            //         clip.start += leastDelta;
            //         clip.fadein += leastDelta;
            //         clip.fadeout += leastDelta;

            //         // TODO: swap all indexes, hover, selected, edited
            //         // TODO: lastClipsSelected check clips selected and change clipIndex
            //         // TODO: vertical movement
            //         // ------------ TODO: lastClipsSelected should be ordered
            //         // TODO: clipsInRange not take into account selected clips (although they should be taken into account)
            //             // if next is selected: do not update leastDelta
            //             // otherwise proceed as usual

            //         if(this.onContentMoved) {
            //             this.onContentMoved(clip, leastDelta);
            //         }
            //     }

            if ( this.lastClipsSelected.length ) {
                this.movingKeys = true;
                for(let i = 0; i < this.lastClipsSelected.length; i++){
                    
                    let trackIdx = this.lastClipsSelected[i][0];
                    let clipIdx = this.lastClipsSelected[i][1];
                    let clip = this.animationClip.tracks[trackIdx].clips[clipIdx];
                    let diff = clip.start + delta < 0 ? - clip.start : delta;
                    
                    if( this.dragClipMode == "move" ) {
                        let clipsInRange = this.getClipsInRange(this.animationClip.tracks[trackIdx], clip.start+diff, clip.start + clip.duration + diff, 0.01)
                        if(clipsInRange && clipsInRange[0] != clipIdx)
                            return;
                        clip.start += diff;
                        if(clip.fadein != undefined)
                            clip.fadein += diff;
                        if(clip.fadeout != undefined)
                            clip.fadeout += diff;
                        
                        this.canvas.style.cursor = "grabbing";
                        
                        if( this.lastClipsSelected.length == 1 && e.track && e.movementY != 0) {

                            let clips = this.getClipsInRange(e.track, clip.start, clip.start + clip.duration, 0.01)
                            if(!clips) {
                                let clipIndex = this.addClipInTrack(clip, e.track.idx);
                                this.deleteClip(clip);
                                e.track.selected[clipIndex] = true;
                                this.lastClipsSelected = [[e.track.idx, clipIndex]];
                                return true;
                            }     
                        }
                    }
                    else if( this.dragClipMode == "fadein" ) {
                        clip.fadein = Math.min(Math.max((clip.fadein || 0) + delta, clip.start), clip.start+clip.duration);
                        diff = 0;
                    }
                    else if( this.dragClipMode == "fadeout" ) {
                        clip.fadeout = Math.max(Math.min((clip.fadeout || clip.start+clip.duration) + delta, clip.start+clip.duration), clip.start);
                        diff = 0;
                    }
                    else if( this.dragClipMode == "duration" ) {
                        clip.duration += delta;
                        clip.fadeout = Math.max(Math.min((clip.fadeout || clip.start+clip.duration) + delta, clip.start+clip.duration), clip.start);
                        diff = 0;
                    }

                    if(this.duration < clip.start + clip.duration){
                        this.setDuration(clip.start + clip.duration);
                    }
                    if(this.onContentMoved) {
                        this.onContentMoved(clip, diff);
                    }
                }
            }
            
            return true;
        } 
        else if(e.track) { // mouse not dragging, just hovering

            this.unHoverAll();
            let clips = this.getClipsInRange(e.track, time, time, 0.1)
            if(!e.track.locked && clips) {
                                
                this.lastHovered = [e.track.idx, clips[0]];
                e.track.hovered[clips[0]] = true;

                let clip = e.track.clips[clips[0]];
                if(!clip) {
                    return;
                }
                
                const durationX = this.timeToX(clip.start + clip.duration);
                const fadeinX = this.timeToX(clip.fadein);
                const fadeoutX = this.timeToX(clip.fadeout);
                if(Math.abs(e.localX - durationX) < 8) {
                    this.canvas.style.cursor = "col-resize";
                    this.dragClipMode = "duration";
                }
                else if(Math.abs(e.localX - fadeinX) < 8) {
                    this.canvas.style.cursor = "e-resize";
                    this.dragClipMode = "fadein";
                }
                else if(Math.abs(e.localX - fadeoutX) < 8) {
                    this.canvas.style.cursor = "e-resize";
                    this.dragClipMode = "fadeout";
                }
                else {
                    this.dragClipMode = "";
                }
            }
        }
        else {
            this.unHoverAll(); 
        }

    }

    onDblClick( e ) {
        
        let track = e.track;
        let localX = e.localX;

        this.selectClip(track, null, localX); // unselect and try to select clip in localX, if any
        if(this.lastClipsSelected.length && this.onSelectClip)  {
            this.onSelectClip(track.clips[this.lastClipsSelected[0][1]]);
        }
    }

    showContextMenu( e ) {

        e.preventDefault();
        e.stopPropagation();

        let actions = [];
        if(this.lastClipsSelected.length) {
            actions.push(
                {
                    title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                    callback: () => { this.copyContent();}
                }
            )
            actions.push(
                {
                    title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                    callback: () => {
                        this.deleteContent({});
                        // this.optimizeTracks();
                    }
                }
            )
        }
        else{
            
            if(this.clipsToCopy)
            {
                actions.push(
                    {
                        title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => {
                            this.pasteContent();
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

    drawContent( ctx, timeStart, timeEnd )  {

        if(!this.animationClip)  
            return;
        let tracks = this.animationClip.tracks|| [{name: "NMF", clips: []}];
        if(!tracks) 
            return;
                  
        const height = this.trackHeight;

        this.scrollableHeight = (tracks.length)*height + this.topMargin;
        let	scroll_y = - this.currentScrollInPixels;
        
        ctx.save();
        for(let i = 0; i < tracks.length; i++) {
            let track = tracks[i];
            this.drawTrackWithBoxes(ctx, (i) * height + scroll_y, height, track.name || "", track);
        }
        
        ctx.restore();
      
    }

    // Creates a map for each item -> tracks
    processTracks(animation) {

        this.tracksPerItem = {}; // maps ( the name of item and local track index ) to ( animation tracks ). Holds pointers to tracks of animationClip.tracks  
        this.tracksDictionary = {};
        this.animationClip = {
            name: (animation && animation.name) ? animation.name : "animationClip",
            duration: animation ? animation.duration : 0,
            speed: (animation && animation.speed ) ? animation.speed : this.speed,
            tracks: []
        };

        if (animation && animation.tracks){
            for( let i = 0; i < animation.tracks.length; ++i ) {
    
                let track = animation.tracks[i];
    
                const name = track.name;
                const type = track.type;
    
                let trackInfo = {
                    fullname: track.name,
                    clips: track.clips,
                    name: name, type: type,
                    selected: [], edited: [], hovered: [], 
                    active: true,
                    locked: false,
                    times: track.times,
                };
                
                this.tracksDictionary[track.name] = name;
    
                this.animationClip.tracks.push(trackInfo);
            }
        }
        else {
            this.addNewTrack();
        }
    }

    /**
     * @method optimizeTrack
     */

    optimizeTrack(trackIdx) {	
    }

    /**
     * @method optimizeTracks
     */

    optimizeTracks() {
    }

    /** Add a clip to the timeline in a free track slot at the current time
     * @clip: clip to be added
     * @offsetTime: (optional) offset time of current time
     * @callback: (optional) function to call after adding the clip
    */
    addClip( clip, offsetTime = 0, callback = null ) {

        // Update clip information
        let trackIdx = null;
        let newStart = this.currentTime + offsetTime + clip.start;
        if(clip.fadein != undefined)
            clip.fadein += (newStart - clip.start);
        else
            clip.fadein = 0;

        if(clip.fadeout != undefined)
            clip.fadeout += (newStart - clip.start);
        else
            clip.fadeout = clip.duration;

        clip.start = newStart;

        // Time slot with other clip?
        let clipInCurrentSlot = null;
        if(!this.animationClip || !this.animationClip.tracks || !this.animationClip.tracks.length) {
            this.addNewTrack();
        }

        for(let i = 0; i < this.animationClip.tracks.length; i++) {
            clipInCurrentSlot = this.animationClip.tracks[i].clips.find( t => { 
                return LX.UTILS.compareThresholdRange(newStart, clip.start + clip.duration, t.start, t.start+t.duration);                
            });

            if(!clipInCurrentSlot)
            {
                trackIdx = i;
                break;
            }
            console.warn("There is already a clip stored in time slot ", clipInCurrentSlot)
        }
        if(trackIdx == undefined)
        {
            // clipIdx = this.animationClip.tracks.length;
            // this.animationClip.tracks.push({clipIdx: clipIdx, clips: []} );
            trackIdx = this.addNewTrack();
        }
        //this.saveState(clipIdx);

        // Find new index
        let newIdx = this.animationClip.tracks[trackIdx].clips.findIndex( t => t.start > newStart );

        // Add as last index
        let lastIndex = false;
        if(newIdx < 0) {
            newIdx = this.animationClip.tracks[trackIdx].clips.length;
            lastIndex = true;
        }
        
        //Save track state before add the new clip
        this.saveState(trackIdx, newIdx);

        // Add clip
        this.animationClip.tracks[trackIdx].clips.splice(newIdx, 0, clip); //insert clip into newIdx (or push at the end)

        // Move the other's clips properties
        let track = this.animationClip.tracks[trackIdx];
        for(let i = (track.clips.length - 1); i > newIdx; --i) {
            track.edited[i - 1] ? track.edited[i] = track.edited[i - 1] : 0;
        }
        
        // Reset this clip's properties
        track.hovered[newIdx] = false;
        track.selected[newIdx] = true;
        track.edited[newIdx] = false;

        this.lastClipsSelected.push( [track.idx, newIdx] );
            
        let end = clip.start + clip.duration;
        
        if( end > this.duration || !this.animationClip.duration)
        {
            this.setDuration(end);
        }

         // Update animation action interpolation info
         if(this.onUpdateTrack)
            this.onUpdateTrack( trackIdx );

        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        if(this.onSelectClip)
            this.onSelectClip(clip);

        if(callback)
            callback();

        // this.resize();
        return newIdx;
    }

     /** Add a clip to the timeline in a free track slot at the current time
     * @clip: clip to be added
     * @trackIdx: track index where to add the track
     * @offsetTime: (optional) offset time of current time
     * @callback: (optional) function to call after adding the clip
    */
     addClipInTrack( clip, trackIdx, offsetTime = 0, callback = null ) {

        // Time slot with other clip?
        if(!this.animationClip) 
            return;

        // Find new index
        let newIdx = this.animationClip.tracks[trackIdx].clips.findIndex( t => t.start > clip.start );

        // Add as last index
        let lastIndex = false;
        if(newIdx < 0) {
            newIdx = this.animationClip.tracks[trackIdx].clips.length;
            lastIndex = true;
        }

        // Add clip
        const clipsArray = [];
        this.animationClip.tracks[trackIdx].clips.forEach( (a, b) => {
            b == newIdx ? clipsArray.push(clip, a) : clipsArray.push(a);
        } );

        if(lastIndex) {
            clipsArray.push(clip);			
        }

        this.animationClip.tracks[trackIdx].clips = clipsArray;	
        // Move the other's clips properties
        let track = this.animationClip.tracks[trackIdx];
        for(let i = (track.clips.length - 1); i > newIdx; --i) {
            track.edited[i - 1] ? track.edited[i] = track.edited[i - 1] : 0;
        }
        
        // Reset this clip's properties
        track.hovered[newIdx] = false;
        track.selected[newIdx] = false;
        track.edited[newIdx] = false;

          
        let end = clip.start + clip.duration;
        
        if( end > this.duration || !this.animationClip.duration)
        {
            this.setDuration(end);
        }

         // // Update animation action interpolation info
         if(this.onUpdateTrack)
            this.onUpdateTrack( trackIdx );

        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        if(callback)
            callback();
        return newIdx;
    }

    /** Add an array of clips to the timeline in the first free track at the current time
     * @clips: clips to be added
     * @offsetTime: (optional) offset time of current time
     * @callback: (optional) function to call after adding the clip
    */
    addClips( clips, offsetTime = 0, callback = null ) {
       
        if(!this.animationClip || !this.animationClip.tracks || !this.animationClip.tracks.length) 
            this.addNewTrack();

        //Search track where to place each new clip
        let trackIdxs = {};
        for(let i = 0; i < this.animationClip.tracks.length; i++) {
            trackIdxs = {}

            for(let c = 0; c < clips.length; c++) {
                let clip = clips[c];
                // Update clip information
                let newStart = this.currentTime + offsetTime + clip.start;

                // Time slot with other clip?
                let clipInCurrentSlot = null;

                if( c == 0 ) {
                    clipInCurrentSlot = this.animationClip.tracks[i].clips.find( t => { 
                        return LX.UTILS.compareThresholdRange(newStart, newStart + clip.duration, t.start, t.start+t.duration);                
                    });
                    
                    if(!clipInCurrentSlot)
                    {
                        trackIdxs[c] = {trackIdx:i , start: newStart, end: newStart + clip.duration};
                    } else {
                        console.warn("There is already a clip stored in time slot ", clipInCurrentSlot)
                        if(!this.animationClip.tracks[i+1]) {
                            this.addNewTrack();
       
                            trackIdxs[c] = {trackIdx: i+1, start: newStart, end: newStart + clip.duration};
                        }
                        else {

                            break;
                        }
                    }
                }
                else {

                    for(let t in trackIdxs) {
                        if(trackIdxs[t].trackIdx == trackIdxs[c -1].trackIdx) {
                            clipInCurrentSlot = LX.UTILS.compareThresholdRange(newStart, newStart + clip.duration, trackIdxs[t].start, trackIdxs[t].end);                
                            if(clipInCurrentSlot)
                                break;
                        }                     
                    }
                    if(!clipInCurrentSlot) {
                        clipInCurrentSlot = this.animationClip.tracks[trackIdxs[c-1].trackIdx].clips.find( t => { 
                            return LX.UTILS.compareThresholdRange(newStart, newStart + clip.duration, t.start, t.start+t.duration);                
                        });   
                    }
                    if(!clipInCurrentSlot) {

                        trackIdxs[c] = {trackIdx: trackIdxs[c-1].trackIdx, start: newStart, end: newStart + clip.duration};
                    } 
                    else{
                        
                        let j = trackIdxs[c-1].trackIdx + 1;
                        if(this.animationClip.tracks[j]) {

                            clipInCurrentSlot = this.animationClip.tracks[j].clips.find( t => { 
                                return LX.UTILS.compareThresholdRange(newStart, newStart + clip.duration, t.start, t.start+t.duration);                
                            });
                            
                            if(!clipInCurrentSlot) {

                                trackIdxs[c] = {trackIdx: j, start: newStart, end: newStart + clip.duration};
                            } 
                            else {
                                break;
                            }
                        }
                        else {

                            this.addNewTrack();
                            trackIdxs[c] = {trackIdx: j, start: newStart, end: newStart + clip.duration};
                        }   
                    }
                    
                    if(trackIdxs[c] == null) {
                        c = 0;
                        trackIdxs = {}
                    }
                }
                
            }

            if(Object.keys(trackIdxs).length == clips.length) {
                break;
            }
        }

        //Add each clip in the assigned free slot track
        for(let i = 0; i < clips.length; i++) {
            let clip = clips[i];
            let newStart = trackIdxs[i].start; 
            if(clip.fadein != undefined)
                clip.fadein += (newStart - clip.start);
            if(clip.fadeout != undefined)
                clip.fadeout += (newStart - clip.start);
            clip.start = newStart;
            clip.end = clip.start + clip.duration;

            // Find new index
            let trackIdx = trackIdxs[i].trackIdx;
            let newIdx = this.animationClip.tracks[trackIdx].clips.findIndex( t => t.start > trackIdxs[i].start );

            // Add as last index
            let lastIndex = false;
            if(newIdx < 0) {
                newIdx = this.animationClip.tracks[trackIdx].clips.length;
                lastIndex = true;
            }

            // Add clip
            const clipsArray = [];
            this.animationClip.tracks[trackIdx].clips.forEach( (a, b) => {
                b == newIdx ? clipsArray.push(clip, a) : clipsArray.push(a);
            } );

            if(lastIndex) {
                clipsArray.push(clip);			
            }

            //Save track state before add the new clip
            this.saveState(trackIdx, newIdx);
            this.animationClip.tracks[trackIdx].clips = clipsArray;	
            // Move the other's clips properties
            let track = this.animationClip.tracks[trackIdx];
            for(let i = (track.clips.length - 1); i > newIdx; --i) {
                track.edited[i - 1] ? track.edited[i] = track.edited[i - 1] : 0;
            }
            
            // Reset this clip's properties
            track.hovered[newIdx] = undefined;
            track.selected[newIdx] = true;
            track.edited[newIdx] = undefined;
            this.lastClipsSelected.push( [track.idx, newIdx] );
            
            let end = clip.start + clip.duration;
            
            if( end > this.duration || !this.animationClip.duration)
            {
                this.setDuration(end);
            }
            
        }

        // Update animation action interpolation info
        if(this.onUpdateTrack && Object.keys(trackIdxs).length){
            let tracksChanged = [];
            for( let c in trackIdxs ) {
                if ( tracksChanged.includes(trackIdxs[c].trackIdx) ) {
                    continue;
                } 
                tracksChanged.push(trackIdxs[c].trackIdx); 
            }
            this.onUpdateTrack( tracksChanged );
        }
        
        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        if(callback)
            callback();

        this.resize();
        return true;
    }

    deleteContent() {
        this.deleteClip({});
    }

    /** Delete clip from the timeline
     * @clip: clip to be delete
     * @callback: (optional) function to call after deleting the clip
    */
    deleteClip( e, clip, callback ) {
            
        if(e.multipleSelection || !clip) {

            // Split in tracks
            const perTrack = [];
            this.lastClipsSelected.forEach( e => perTrack[e[0]] ? perTrack[e[0]].push(e) : perTrack[e[0]] = [e] );
            
            for(let pts of perTrack) {
                
                if(!pts) continue;

                pts = pts.sort( (a,b) => a[2] - b[2] );
                
                let deletedIndices = 0;

                // Delete every selected clip
                for(let [trackIdx, clipIdx] of pts) {
                    this.saveState(trackIdx, clipIdx);
                    this.#delete(trackIdx, clipIdx );
                    deletedIndices++;
                }
            }
        } 
        else if ( clip ){
            const [trackIdx, clipIdx]  = clip;

            this.saveState(trackIdx, clipIdx);
            this.#delete( trackIdx, clipIdx );
        }
        

        if(callback)
            callback();
        
        //this.unSelectAllClips();
        // // Update animation action interpolation info

    }

    #delete( trackIdx, clipIdx) {

        let clips = this.animationClip.tracks[trackIdx].clips;
        if(clipIdx >= 0)
        {
            clips = [...clips.slice(0, clipIdx), ...clips.slice(clipIdx + 1, clips.length)];
            this.animationClip.tracks[trackIdx].clips = clips;
            this.animationClip.tracks[trackIdx].hovered[clipIdx] = false;
            this.animationClip.tracks[trackIdx].selected[clipIdx] = false;
            this.animationClip.tracks[trackIdx].edited[clipIdx] = false;

            if(clips.length)
            {
                let selectedIdx = 0;
                for(let i = 0; i < this.lastClipsSelected.length; i++)
                {
                    let [t,c] = this.lastClipsSelected[i];
                
                    if( t == trackIdx  && c > clipIdx)
                        this.lastClipsSelected[i][1] = c - 1;
                    if(t == trackIdx && c == clipIdx)
                        selectedIdx = i;
                }
                this.lastClipsSelected.splice(selectedIdx,1);
            }
            else {
                let selectedIdx = this.lastClipsSelected.findIndex(  c=> c[0] == trackIdx && c[1] == clipIdx);
                this.lastClipsSelected.splice(selectedIdx, 1);
            }
        }
        return true;
    }

    copyContent() {
        this.clipsToCopy = [...this.lastClipsSelected];
    }

    pasteContent() {
        if(!this.clipsToCopy)
            return;
        
        this.clipsToCopy.sort((a,b) => {
            if(a[0]<b[0]) 
                return -1;
            return 1;
        });

        for(let i = 0; i < this.clipsToCopy.length; i++){
            let [trackIdx, clipIdx] = this.clipsToCopy[i];
            let clipToCopy = Object.assign({}, this.animationClip.tracks[trackIdx].clips[clipIdx]);
            this.addClip(clipToCopy, this.clipsToCopy.length > 1 ? clipToCopy.start : 0); 
        }
        this.clipsToCopy = null;
    }

    /**
     * @method addNewTrack
     */

    addNewTrack() {

        if(!this.animationClip)
            this.animationClip = {duration:0, tracks:[]};

        let trackInfo = {
            idx: this.animationClip.tracks.length,
            clips: [],
            selected: [], edited: [], hovered: [], active: true
        };

        this.animationClip.tracks.push(trackInfo);
        this.updateLeftPanel();
        return trackInfo.idx;
    }

    /**
     * @method clearTrack
     */

    clearTrack(idx) {

        if(!this.animationClip) {
            this.animationClip = {tracks:[]};
            return;
        }
        this.saveState(idx);
        
        if(this.animationClip.tracks[idx].locked )
        {
            return;
        }
        let trackInfo = {
            idx: idx,
            clips: [],
            selected: [], edited: [], hovered: []
        };
        //delete all selectedclips
        this.animationClip.tracks[idx] = trackInfo;
        let selected = [];
        for(let i = 0; i < this.lastClipsSelected.length; i++) {
            let [trackIdx, clipIdx] = this.lastClipsSelected[i];
            if(trackIdx != idx)
                selected.push(this.lastClipsSelected[i]);

        }
        this.lastClipsSelected = selected;
        return trackInfo.idx;
    }

    saveState( trackIdx, clipIdx ) {

        let track = this.animationClip.tracks[trackIdx];
        let clips = Array.from(track.clips);
        let trackInfo = Object.assign({}, track);
        trackInfo.clips = clips;
        trackInfo.selected.fill(false);
        this.trackState.push({
            idx: clipIdx,
            t: trackInfo,
            editedTracks: [].concat(trackInfo.edited)
        });
    }

    undo() {
        
        if(!this.trackState.length)
        return;

        const state = this.trackState.pop();
        this.animationClip.tracks[state.t.idx].clips = state.t.clips;

        // Update animation action interpolation info
        if(this.onUpdateTrack)
            this.onUpdateTrack( state.t.idx );
    }
    
    getCurrentClip( track, time, threshold ) {

        if(!track || !track.clips.length)
        return -1;

        // Avoid iterating through all timestamps
        if((time + threshold) < track.clips[0].start)
        return -1;

        for(let i = 0; i < track.clips.length; ++i) {
            let t = track.clips[i];
            if(t.start + t.duration >= (time - threshold) && 
                t.start <= (time + threshold)) {
                return i;
            }
        }

        return -1;
    };

    unSelectAllClips() {

        for(let [ idx, keyIndex] of this.lastClipsSelected) {
            this.animationClip.tracks[idx].selected[keyIndex]= false;
        }
        // Something has been unselected
        const unselected = this.lastClipsSelected.length > 0;
        this.lastClipsSelected.length = 0;
        return unselected;
    }

    selectAll( ) {

        this.unSelectAllClips();
        for(let idx = 0; idx < this.animationClip.tracks.length; idx++) {
            for(let clipIdx = 0; clipIdx < this.animationClip.tracks[idx].clips.length; clipIdx++) {
                this.animationClip.tracks[idx].selected[clipIdx] = true;
                let currentSelection = [ idx, clipIdx];
                this.lastClipsSelected.push( currentSelection );
            }
        }
        if(this.onSelectClip)
            this.onSelectClip();
    }

    selectClip( track, clipIndex, localX = null, unselect = true, skipCallback = false ) {

        clipIndex = clipIndex ?? this.getCurrentClip( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );

        if(unselect){
            this.unSelectAllClips();
        }
                        
        if(clipIndex == -1)
            return -1;

        if(track.selected[clipIndex])
            return clipIndex;

        // Select if not handled

        // push selection sorted by track index and clip index
        let i = 0;
        for( ; i < this.lastClipsSelected.length; ++i){
            let t = this.lastClipsSelected[i];
            if ( t[0] > track.idx || t[1] > clipIndex ){ break;}
        }
        this.lastClipsSelected.splice(i,0, [track.idx, clipIndex] ); //
        track.selected[clipIndex] = true;

        if( !skipCallback && this.onSelectClip ){
            this.onSelectClip(track.clips[ clipIndex ]);
            // Event handled
        }
        return clipIndex;
    }

    getClipsInRange( track, minTime, maxTime, threshold ) {

        if(!track || !track.clips.length)
        return null;

        // Manage negative selection
        if(minTime > maxTime) {
            let aux = minTime;
            minTime = maxTime;
            maxTime = aux;
        }

        minTime -= threshold;
        maxTime += threshold;

        // Avoid iterating through all timestamps
        minTime -= threshold;
        maxTime += threshold;
        
        const clips = track.clips; 
        if(maxTime < clips[0].start || minTime > (clips[clips.length-1].start + clips[clips.length-1].duration) )
            return null;

        let indices = [];

        for(let i = 0; i < clips.length; ++i) {
            const t = clips[i];
            if ( t.start+t.duration < minTime || t.start > maxTime ){ 
                continue; 
            }
            indices.push(i);
        }
        return indices.length ? indices : null;
    }

    validateDuration(t) {
        for(let i = 0; i < this.animationClip.tracks.length; i++) {
            const track = this.animationClip.tracks[i];
            const clipsIdxs = this.getClipsInRange( track, t , this.animationClip.duration, 0 );
            if(!clipsIdxs)
                continue;
            const clip = track.clips[clipsIdxs[clipsIdxs.length - 1]];
            t = Math.max(t, clip.start + clip.duration);
        }
        return t;
    }
}

LX.ClipsTimeline = ClipsTimeline;


/**
 * @class CurvesTimeline
 */

class CurvesTimeline extends Timeline {       

    /**
     * @param {string} name 
     * @param {object} options = {animationClip, selectedItems, x, y, width, height, canvas, trackHeight, range}
     */
    constructor(name, options = {}) {

        super(name, options);
        
        this.tracksPerItem = {};
        
        // this.selectedItems = selectedItems;
        this.autoKeyEnabled = false;
        this.valueBeforeMove = 0;
        this.range = options.range || [0, 1];

        if(this.animationClip && this.animationClip.tracks.length)
            this.processTracks(this.animationClip);
    }

    onMouseUp( e, time)  {

        let track = e.track;
        let localX = e.localX;
        let discard = e.discard;
        
        if(e.shiftKey) {
            e.multipleSelection = true;
            // Multiple selection
            if(!discard && track) {
                this.processCurrentKeyFrame( e, null, track, localX, true ); 
            }
            // Box selection
            else if(this.boxSelectionEnd){
        
                this.unSelectAllKeyFrames();
                
                let tracks = this.getTracksInRange(this.boxSelectionStart[1], this.boxSelectionEnd[1], this.pixelsToSeconds * 5);
                
                for(let t of tracks) {
                    let keyFrameIndices = this.getKeyFramesInRange(t, 
                        this.xToTime( this.boxSelectionStart[0] ), 
                        this.xToTime( this.boxSelectionEnd[0] ),
                        this.pixelsToSeconds * 5);
                        
                    if(keyFrameIndices) {
                        for(let index = keyFrameIndices[0]; index <= keyFrameIndices[1]; ++index){
                            this.processCurrentKeyFrame( e, index, t, null, true );
                        }
                    }
                }
            }

        }else {
            if(discard || !track) {
                this.unSelectAllKeyFrames();                               
            }                       
        }

        this.canvas.classList.remove('grabbing');
        this.boxSelection = false;
        this.boxSelectionStart = null;
        this.boxSelectionEnd = null;

    }

    onMouseDown( e, time ) {

        let localX = e.localX;
        let localY = e.localY;
        let track = e.track;

        if(e.shiftKey) {
            this.boxSelection = true;
            this.boxSelectionStart = [localX, localY - this.topMargin];
            e.multipleSelection = true;

        }
        else if(track && !track.locked) {

            const keyFrameIndex = this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );
            if( keyFrameIndex > -1 ) {
                this.processCurrentKeyFrame( e, keyFrameIndex, track, null, e.multipleSelection ); // Settings this as multiple so time is not being set
                if(e.ctrlKey || e.altKey) {
                    this.movingKeys = true;
                    this.canvas.style.cursor = "grab";  

                }
                // Set pre-move state
                for(let selectedKey of this.lastKeyFramesSelected) {
                    let [name, idx, keyIndex] = selectedKey;
                    let trackInfo = this.tracksPerItem[name][idx];
                    selectedKey[3] = this.animationClip.tracks[ trackInfo.clipIdx ].times[ keyIndex ];
                }
                
                this.timeBeforeMove = track.times[ keyFrameIndex ];
                this.valueBeforeMove = localY;
            }
        }
        else if(!track) {
            this.unSelectAllKeyFrames()           
        }
    }

    onMouseMove( e, time ) {
        
        let localX = e.localX;
        let localY = e.localY;
        let track = e.track;
        
        // Manage keyframe movement
        if(this.movingKeys) {
            this.clearState();
            const newTime = this.xToTime( localX );
            
            for( let i = 0; i < this.lastKeyFramesSelected.length; ++i ){
                let s = this.lastKeyFramesSelected[i]; // pointer
                let name = s[0], idx = s[1], keyIndex = s[2], keyTime = s[3];
                track = this.tracksPerItem[name][idx];
                if(track && track.locked)
                    return;
                
                this.canvas.style.cursor = "grabbing";

                if(e.ctrlKey) {
                    const delta = this.timeBeforeMove - keyTime;
                    this.animationClip.tracks[ track.clipIdx ].times[ keyIndex ] = Math.min( this.animationClip.duration, Math.max(0, newTime - delta) );
                
                    let times = track.times;
                    let k = s[2];
                    for( ; k > 0; --k ){
                        if ( times[k-1] < times[k] ){ 
                            break; 
                        }
                        this.swapKeyFrames(track, k-1, k);
                    }
                    for( ; k < track.times.length-1; ++k ){
                        if ( times[k+1] > times[k] ){ 
                            break; 
                        }
                        this.swapKeyFrames(track, k+1, k);
                    }
                    s[2] = k; // "s" is a pointer. Modify selected keyFrame index
                }

                if(e.altKey) {
                    let trackRange = [this.tracksDrawn[track.idx][1], this.tracksDrawn[track.idx][1] + this.trackHeight];
                    localY = Math.min( trackRange[1], Math.max(trackRange[0], localY) );
                    
                    //convert to range track values
                    let value = (((localY - trackRange[1]) * (this.range[1] - this.range[0])) / (trackRange[0] - trackRange[1])) + this.range[0];
                    track.edited[keyIndex] = true;
                    this.animationClip.tracks[ track.clipIdx ].values[ keyIndex ] = value;
                    LX.emit( "@on_change_" + this.tracksDrawn[track.idx][0].type, value );
                }
            }
            return
            
           
        }

        if( this.grabbing && e.button != 2) {
                
        }
        else if(track) {

            this.unHoverAll();
            let keyFrameIndex = this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );
            if(keyFrameIndex > -1) {
                
                const name = this.tracksDictionary[track.fullname]; 
                let t = this.tracksPerItem[ name ][track.idx];
                if(t && t.locked)
                    return;
            
                this.lastHovered = [name, track.idx, keyFrameIndex];
                t.hovered[keyFrameIndex] = true;

            }
        }
        else {
            this.unHoverAll();
        }
    }

    showContextMenu( e ) {

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
                            this.pasteContent();
                        }
                    }
                )
            }
            actions.push(
                {
                    title: "Copy",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                    callback: () => {
                        this.copyContent();
                    }
                }
            )
            actions.push(
                {
                    title: "Delete",// + " <i class='bi bi-trash float-right'></i>",
                    callback: () => {
                        this.deleteContent({});
                        
                    }
                }
            )
        }
        else{
            
            actions.push(
                {
                    title: "Add",
                    callback: () => this.addKeyFrame( e.track, 0 )
                }
            )

            if(this.clipboard && this.clipboard.keyframes)
            {
                actions.push(
                    {
                        title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                        callback: () => {
                            this.pasteContent();
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

    drawContent( ctx, timeStart, timeEnd ) {
    
        if(!this.animationClip || this.selectedItems == null || !this.tracksPerItem) 
            return;

        ctx.save();
        this.scrollableHeight = this.topMargin;
        
        let offset = this.trackHeight;
        for(let t = 0; t < this.selectedItems.length; t++) {
            let tracks = this.tracksPerItem[this.selectedItems[t]] ? this.tracksPerItem[this.selectedItems[t]] : [{name: this.selectedItems[t]}];
            if(!tracks) continue;
            
            const height = this.trackHeight;
            this.scrollableHeight += (tracks.length+1)*height;
            let	scroll_y = - this.currentScrollInPixels;

            let offsetI = 0;
            for(let i = 0; i < tracks.length; i++) {
                let track = tracks[i];
                if(track.hide) {
                    continue;
                }
               
                this.drawTrackWithCurves(ctx, offsetI * height + offset + scroll_y, height, track.name + " (" + track.type + ")", this.animationClip.tracks[track.clipIdx], track);
                offsetI++;
            }
            offset += offsetI * height + height;
        }
        ctx.restore();

    };

    drawTrackWithCurves (ctx, y, trackHeight, name, track, trackInfo) {
        let keyframes = track.times;
        let values = track.values;

        if(keyframes) {
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = Timeline.TRACK_SELECTED_LIGHT//"#2c303570";
            if(trackInfo.isSelected)
                ctx.fillRect(0, y - 3, ctx.canvas.width, trackHeight );      
                
            ctx.globalAlpha = 1;
            this.tracksDrawn.push([track,y+this.topMargin,trackHeight]);
                
            //draw lines
            ctx.strokeStyle = "white";
            ctx.beginPath();
            for(var j = 0; j < keyframes.length; ++j)
            {

                let time = keyframes[j];
                let value = values[j];
                
                //convert to timeline track range
                value = (((value - this.range[0]) * ( -this.trackHeight) ) / (this.range[1] - this.range[0])) + this.trackHeight;

                if( time < this.startTime && time > this.endTime )
                    continue;
                let keyframePosX = this.timeToX( time );
                
                ctx.save();
                ctx.translate(keyframePosX, y );
               
                if( keyframePosX <=  this.sidebarWidth ){
                    ctx.moveTo( 0, value );  
                }
                else { 
                    ctx.lineTo( 0, value );  
                }
                ctx.restore()
                
            }
            ctx.stroke();
            ctx.closePath();
            ctx.fillStyle = Timeline.COLOR;
            //draw points
            for(var j = 0; j < keyframes.length; ++j)
            {
                let time = keyframes[j];
                let selected = trackInfo.selected[j];
                let margin = 0;
                let size = 5;
                if( time < this.startTime || time > this.endTime )
                    continue;
                var keyframePosX = this.timeToX( time );
                if( keyframePosX > this.sidebarWidth ){
                    ctx.save();

                    
                    if(trackInfo.edited[j])
                        ctx.fillStyle = Timeline.COLOR_EDITED;
                    if(selected) {
                        ctx.fillStyle = Timeline.COLOR_SELECTED;
                        //size = 7;
                        margin = -2;
                    }
                    if(trackInfo.hovered[j]) {
                        //size = 7;
                        ctx.fillStyle = Timeline.COLOR_HOVERED;
                        margin = -2;
                    }
                    if(trackInfo.locked)
                        ctx.fillStyle = Timeline.COLOR_LOCK;

                    if(!this.active || !trackInfo.active)
                        ctx.fillStyle = Timeline.COLOR_INACTIVE;
                        
                    ctx.translate(keyframePosX, y);
                    
                    let value = values[j];
                    value = (((value - this.range[0]) * ( -this.trackHeight) ) / (this.range[1] - this.range[0])) + this.trackHeight;

                    ctx.beginPath();
                    ctx.arc( 0, value, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.closePath(); 

                    if(trackInfo.selected[j]) {
                        ctx.fillStyle = Timeline.COLOR_SELECTED;
                        ctx.beginPath();
                        ctx.arc( 0, value, size - margin, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.closePath(); 
                    }
                    ctx.restore();
                }
            }
        }
    }

    onUpdateTracks ( keyType ) {
    
        if(this.selectedItems == null || this.lastKeyFramesSelected.length || !this.autoKeyEnabled)
            return;

        for(let i = 0; i < this.selectedItems.length; i++) {
            let tracks = this.tracksPerItem[this.selectedItems[i]];
            if(!tracks) continue;

            // Get current track
            const selectedTrackIdx = tracks.findIndex( t => t.type === keyType );
            if(selectedTrackIdx < 0)
                return;
            let track = tracks[ selectedTrackIdx ];
            
            // Add new keyframe
            const newIdx = this.addKeyFrame( track );
            if(newIdx === -1) 
                continue;

            // Select it
            this.lastKeyFramesSelected.push( [track.name, track.idx, newIdx] );
            track.selected[newIdx] = true;

        }
        
        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // Update time
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        return true; // Handled
    }

    // Creates a map for each item -> tracks
    processTracks(animation) {

        this.tracksPerItem = {};
        this.tracksDictionary = {};
        this.animationClip = {
            name: (animation && animation.name) ? animation.name : "animationClip",
            duration: animation ? animation.duration : 0,
            speed: (animation && animation.speed ) ? animation.speed : this.speed,
            tracks: []
        };

        if (animation && animation.tracks) { // THREEJS animation
            for( let i = 0; i < animation.tracks.length; ++i ) {
                
                let track = animation.tracks[i];
                
                const [name, type] = this.getTrackName(track.name); // threejs stores tracks as "name.type" --> "hips.quaternion"

                let valueDim = track.dim;
                if ( !valueDim || valueDim < 0 ){
                    if ( track.times.length && track.values.length ){ valueDim = track.values.length/track.times.length; }
                    else{ valueDim = 1; }
                }

                let leftOver = track.values.length % valueDim; // just in case values has an incorrect length
                let amounEntries = Math.min( track.times.length, track.values.length - leftOver );
                let times = track.times.slice(0, amounEntries); 
                let values = track.values.slice(0, amounEntries * valueDim);
                let boolArray = (new Array(amounEntries)).fill(false);

                let trackInfo = {
                    fullname: track.name,
                    name: name, type: type,
                    active: true,
                    locked: false,
                    dim: valueDim,
                    selected: boolArray.slice(), edited: boolArray.slice(), hovered: boolArray.slice(), 
                    times: times,
                    values: values
                };
                
                if(!this.tracksPerItem[name]) {
                    this.tracksPerItem[name] = [trackInfo];
                }else {
                    this.tracksPerItem[name].push( trackInfo );
                }
                
                
                const trackIndex = this.tracksPerItem[name].length - 1;
                trackInfo.idx = trackIndex; // index of track in "name"
                trackInfo.clipIdx = i; // index of track in the entire animation
                
                // Save index also in original track
                track.idx = trackIndex;
                this.tracksDictionary[track.name] = name;
                this.animationClip.tracks.push(trackInfo);
                
            }
        }
    }

    /**
     * updates an existing track with new values and times.
     * @param {Integer} trackIdx index of track in the animationClip 
     * @param {*} newTrack object with two arrays: values and times. These will be set to the selected track
     * @returns 
    */
    updateTrack(trackIdx, newTrack) {
        if(!this.animationClip)
            return false;

        this.animationClip.tracks[trackIdx].values = newTrack.values;
        this.animationClip.tracks[trackIdx].times = newTrack.times;

        let track = this.animationClip.tracks[trackIdx];
        track.selected = (new Array(track.times.length)).fill(false);
        track.hovered = track.selected.slice();
        track.edited = track.selected.slice();
        return true;
    }

    /**
     * removes equivalent sequential keys either because of equal times or values
     * (0,0,0,0,1,1,1,0,0,0,0,0,0,0) --> (0,0,1,1,0,0)
     * @param {Int} trackIdx index of track in the animation
     * @param {Bool} onlyEqualTime if true, removes only keyframes with equal times. Otherwise, values are ALSO compared through the class threshold
     * @param {Bool} enableEvent if true, triggers "onOptimizeTracks" after optimizing
     */
    optimizeTrack(trackIdx, onlyEqualTime = false, enableEvent = true ) {
        if ( !this.animationClip ){ return; }

        const track = this.animationClip.tracks[trackIdx],
            times = track.times,
            values = track.values,
            stride = track.dim,
            threshold = this.optimizeThreshold;
        let cmpFunction = (v, p, n, t) => { return Math.abs(v - p) >= t || Math.abs(v - n) >= t };
        let lastSavedIndex = 0;
        const lastIndex = times.length-1;

        for ( let i = 1; i < lastIndex; ++ i ) {

            let keep = false;
            const time = times[ i ];
            const timePrev = times[ lastSavedIndex ];

            // remove adjacent keyframes scheduled at the same time
            if ( time !== timePrev ) {
                if ( ! onlyEqualTime ) {
                    // remove unnecessary keyframes same as their neighbors
                    const offset = i * stride,
                        offsetP = lastSavedIndex * stride,
                        offsetN = offset + stride;

                    for ( let j = 0; j !== stride; ++ j ) {
                        if( cmpFunction(
                            values[ offset + j ], 
                            values[ offsetP + j ], 
                            values[ offsetN + j ],
                            threshold))
                        {
                            keep = true;
                            break;
                        }
                    }
                } else {
                    keep = true;
                }
            }

            // in-place compaction
            if ( keep ) {
                ++lastSavedIndex;
                if ( i !== lastSavedIndex ) {
                    times[ lastSavedIndex ] = times[ i ];
                    const readOffset = i * stride,
                        writeOffset = lastSavedIndex * stride;
                    for ( let j = 0; j !== stride; ++ j ) {
                        values[ writeOffset + j ] = values[ readOffset + j ];
                    }
                }
            }
        }

        // add last frame. first and last keyframes should be always kept
        if ( times.length > 1 ) {
            ++lastSavedIndex;
            times[ lastSavedIndex ] = times[ times.length - 1 ];
            const readOffset = values.length - stride,
                writeOffset = lastSavedIndex * stride;
            for ( let j = 0; j !== stride; ++j ) {
                values[ writeOffset + j ] = values[ readOffset + j ];
            }
        }
        
        // commit changes
        if ( lastSavedIndex < times.length-1 ) {   
            track.times = times.slice( 0, lastSavedIndex + 1 );
            track.values = values.slice( 0, (lastSavedIndex + 1) * stride );
            this.updateTrack( track.clipIdx, track ); // update control variables (hover, edited, selected) 
        } 

        if(this.onOptimizeTracks && enableEvent)
            this.onOptimizeTracks(trackIdx);
    }

    optimizeTracks(onlyEqualTime = false) {

        if(!this.animationClip)
            return;

        for( let i = 0; i < this.animationClip.tracks.length; ++i ) {
            const track = this.animationClip.tracks[i];
            this.optimizeTrack( track.clipIdx, onlyEqualTime, false );
        }

        if(this.onOptimizeTracks)
            this.onOptimizeTracks(-1); // signal as all tracks
    }
    

    getNumTracks( item ) {
        if(!item || !this.tracksPerItem)
            return;
        const tracks = this.tracksPerItem[item.name];
        return tracks ? tracks.length : null;
    }


    onShowOptimizeMenu( e) {
        
        if(this.selectedItems == null)
            return;

        let tracks = [];
        for(let i = 0; i < this.selectedItems.length; i++) {

            tracks = [...tracks, ...this.tracksPerItem[this.selectedItems[i]]];
            if(!tracks) continue;

        }
        if(!tracks.length) return;

        const threshold = this.onGetOptimizeThreshold ? this.onGetOptimizeThreshold() : 0.025;
        LX.addContextMenu("Optimize", e, m => {
            for( let t of tracks ) {
                m.add( t.name + (t.type ? "@" + t.type : ""), () => { 
                    this.optimizeTrack( t.clipIdx, false );
                })
            }
        });
    }

    isKeyFrameSelected( track, index ) {
        return track.selected[ index ];
    }

    /**
    * @param {Number} trackIdx index of track in the animation (not local index) 
    */
    saveState( trackIdx ) {
        const trackInfo = this.animationClip.tracks[trackIdx];
        this.trackState.push({
            idx: trackIdx,
            t: trackInfo.times.slice(),
            v: trackInfo.values.slice(),
            editedTracks: [].concat(trackInfo.edited)
        });
    }

    undo() {
        
        if(!this.trackState.length)
        return;

        const state = this.trackState.pop();
        this.animationClip.tracks[state.idx].times = state.t;
        this.animationClip.tracks[state.idx].values = state.v;

        const localIdx = this.animationClip.tracks[state.idx].idx;
        const name = this.getTrackName(this.animationClip.tracks[state.idx].name)[0];
        this.tracksPerItem[name][localIdx].edited = state.editedTracks;

        // Update animation action interpolation info
        if(this.onUpdateTrack)
            this.onUpdateTrack( state.idx );
    }

    /**
    * 
    * @param {*} track 
    * @param {Number} srcIdx keyFrame index
    * @param {Number} trgIdx keyFrame index  
    */
    swapKeyFrames(track, srcIdx, trgIdx){
        let times = track.times;
        let values = track.values;

        let tmp = times[srcIdx];
        times[srcIdx] = times[trgIdx];
        times[trgIdx] = tmp;

        tmp = track.hovered[srcIdx];
        track.hovered[srcIdx] = track.hovered[trgIdx];
        track.hovered[trgIdx] = tmp;

        tmp = track.edited[srcIdx];
        track.edited[srcIdx] = track.edited[trgIdx];
        track.edited[trgIdx] = tmp;

        tmp = track.selected[srcIdx];
        track.selected[srcIdx] = track.selected[trgIdx];
        track.selected[trgIdx] = tmp;

        let src = srcIdx * track.dim;
        let end = src + track.dim;
        let trg = trgIdx * track.dim;
        for( ; src < end; ++src ){
            tmp = values[ src ];
            values[ src ] = values[ trg ];
            values[ trg ] = tmp;
            ++trg;
        }
    }

   /** 
     * @param {object} track track of animation clip (object not index)
     * @param {int} frameIdx frame (index) to select inside the track 
     * @param {bool} unselectPrev if true, unselects previously selected frames. Otherwise, stacks the new selection
     * @returns 
     */
    selectKeyFrame( track, frameIdx, unselectPrev = true ) {        
        if( frameIdx == undefined || !track || track.locked || !track.active )
            return false;

        if ( unselectPrev ){
            this.unSelectAllKeyFrames();
        }

        this.lastKeyFramesSelected.push( [track.name, track.idx, frameIdx, track.clipIdx] );
        track.selected[frameIdx] = true;

        return true;
    }

    copyContent() {
        if (!this.lastKeyFramesSelected.length){ 
            return; 
        }
        
        // sort keyframes selected by track
        let toCopy = {};
        for(let i = 0; i < this.lastKeyFramesSelected.length; i++){
            let [id, localTrackIdx, keyIdx] = this.lastKeyFramesSelected[i];
            let track = this.tracksPerItem[id][localTrackIdx];
            let trackIdx = track.clipIdx;

            if(toCopy[trackIdx]) {
                toCopy[trackIdx].idxs.push(keyIdx);
            } else {
                toCopy[trackIdx] = {track: track, idxs : [keyIdx]};
            }
            if(i == 0) {
                this.copyKeyFrameValue(track, keyIdx);
            }
        }

        // for each track selected, copy its values
        for(let trackIdx in toCopy) {
            this.copyKeyFrames(toCopy[trackIdx].track, toCopy[trackIdx].idxs);
        }
    }
  
    // copies the current value of the keyframe. This value can be pasted across any track (as long as they are of the same type)  
    copyKeyFrameValue( track, index ) {

        // 1 element clipboard by now

        let start = index * track.dim;
        let values = this.animationClip.tracks[ track.clipIdx ].values.slice(start, start + track.dim);

        if(!this.clipboard)
            this.clipboard = {};

        this.clipboard = {
            type: track.type,
            values: values
        };
    }

    // each track will have its own entry of copied keyframes. When pasting, only the apropiate track's keyframes are pasted
    copyKeyFrames( track, indices ) {

        let trackIdx = track.clipIdx;
        if(!this.clipboard)
            this.clipboard = {};
        if(!this.clipboard.keyframes) {
            this.clipboard.keyframes = {};
        }
        
        this.clipboard.keyframes[trackIdx] = { track: track, values:{}, times:{} };

        // 1 element clipboard by now
        for(let i = 0; i < indices.length; i++ ){
            let keyIdx = indices[i];
            let start = keyIdx * track.dim;
            let keyValues = track.values.slice(start, start + track.dim); // copy values into a new array
            this.clipboard.keyframes[trackIdx].values[keyIdx] = keyValues; // save to clipboard
            this.clipboard.keyframes[trackIdx].times[keyIdx] = track.times[keyIdx]; // save to clipboard
        };
    }

    pasteContent() {
        if(!this.clipboard)
            return;
        
        // copy the value into the only selected keyframe
        if(this.clipboard.value && this.lastKeyFramesSelected.length == 1) {

            let [id, localTrackIdx, keyIdx] = this.lastKeyFramesSelected[0];
            this.pasteKeyFrameValue({}, this.tracksPerItem[id][localTrackIdx], keyIdx);
        }

        // create new keyframes from the ones copied 
        if(this.clipboard.keyframes) {
            let currentTime = this.currentTime;
            for(let trackIdx in this.clipboard.keyframes) {
                this.pasteKeyFrames({multipleSelection: this.clipboard.keyframes.length}, trackIdx);
                this.currentTime = currentTime;
            }
        }
    }

    canPasteKeyFrame () {
        return this.clipboard != null;
    }


    #paste( track, index ) {

        let clipboardInfo = this.clipboard.value;

        if(clipboardInfo.type != track.type){
            return;
        }

        let start = index * track.dim;
        let j = 0;
        for(let i = start; i < start + track.dim; ++i) {
            this.animationClip.tracks[ track.clipIdx ].values[i] = clipboardInfo.values[j];
            ++j;
        }

        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        track.edited[ index ] = true;
    }

    pasteKeyFrameValue( e, track, index ) {

        this.saveState(track.clipIdx);

        // Copy to current key
        this.#paste( track, index );
        
        if(!e.multipleSelection)
        return;
        
        // Don't want anything after this
        this.clearState();

        // Copy to every selected key
        for(let [name, idx, keyIndex] of this.lastKeyFramesSelected) {
            this.#paste( this.tracksPerItem[name][idx], keyIndex );
        }
    }

    pasteKeyFrames( e, trackIdx ) {
        
        if ( !this.clipboard.keyframes[trackIdx] ){
            return;
        }
        this.saveState(trackIdx);

        let clipboardInfo = this.clipboard.keyframes[trackIdx];
        let indices = Object.keys(clipboardInfo.values);
        indices.sort(); // just in case

        // Copy to current key
        for(let i = 0; i < indices.length; i++) {
            let value = clipboardInfo.values[indices[i]];
            if(typeof value == 'number')
                value = [value];
            if(i > 0) {
                let delta = clipboardInfo.times[indices[i]] - clipboardInfo.times[indices[i-1]];
                this.currentTime += delta;
            }
            this.addKeyFrame( clipboardInfo.track, value);
        }
    }

    addKeyFrame( track, value = undefined, time = this.currentTime ) {
       
        if(!track) {
            return -1;
        }
        
        // Update animationClip information
        const clipIdx = track.clipIdx;
        track = this.animationClip.tracks[clipIdx];

        let newIdx = this.getNearestKeyFrame( track, time ); 
        
        // Time slot with other key?
        if( newIdx > -1 && Math.abs(track.times[newIdx] - time) < 0.001 ) {
            console.warn("There is already a keyframe [", newIdx, "] stored in time slot [", track.times[newIdx], "]");
            return -1;
        }

        this.saveState(clipIdx);

        // Find index that t[idx] > time
        if(newIdx < 0) { 
            newIdx = 0;
        }
        else if ( track.times[newIdx] < time ){ 
            newIdx++; 
        }

        // Get mid values
        value = value != undefined ? [value] : this.onGetSelectedItem();

        // new arrays. WARNING assuming keyframes are always dim=1
        let times = new Float32Array( track.times.length + 1 );
        let values = new Float32Array( track.values.length + 1 );

        // copy times/values before the new index (valueDim == 1)
        for( let i = 0; i < newIdx; ++i ){ 
            times[i] = track.times[i]; 
            values[i] = track.values[i];
        }

        times[newIdx] = time;
        values[newIdx] = value;

        // copy remaining times/values
        for( let i = newIdx; i < track.times.length; ++i ){ 
            times[i+1] = track.times[i]; 
            values[i+1] = track.values[i];
        }

        track.times = times;
        track.values = values;
            
        // Add new entry into each control array
        track.hovered.splice(newIdx, 0, false);
        track.selected.splice(newIdx, 0, false);
        track.edited.splice(newIdx, 0, true);
       
        // Update animation action interpolation info
        if(this.onUpdateTrack)
            this.onUpdateTrack( clipIdx );

        LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime);
        // if(this.onSetTime)
        //     this.onSetTime(this.currentTime);

        return newIdx;
    }

    deleteContent() {
        
        this.deleteKeyFrame({ multipleSelection: this.lastKeyFramesSelected.length > 1});
    }

   /**
    * Delete a keyframe given the track and the its index
    * @param {Number} trackIdx track that keyframe belongs to 
    * @param {Number} index index of the keyframe on the track
    * @returns 
    */
    #delete( trackIdx, index ) {

        const track = this.animationClip.tracks[trackIdx];
        
        // Don't remove by now the first key (and avoid impossible indices)
        if(index < 1 || index >= track.times.length ) {
            console.warn("Operation not supported! " + (index==0 ?"[removing first keyframe track]":"[removing invalid keyframe " + i + " from " + track.times.length + "]"));
            return false;
        }

        // Delete time key (TypedArrays do not have splice )
        track.times = track.times.filter( (v, i) => i != index);        
        track.edited = track.edited.filter( (v, i) => i != index);
        track.selected = track.selected.filter( (v, i) => i != index);
        track.hovered = track.hovered.filter( (v, i) => i != index);

        // Delete values
        const indexDim = track.dim * index;
        const slice1 = track.values.slice(0, indexDim);
        const slice2 = track.values.slice(indexDim + track.dim);

        track.values = LX.UTILS.concatTypedArray([slice1, slice2], Float32Array);

        // // Move the other's key properties
        // for(let i = index; i < track.times.length; ++i) {
        //     track.edited[i] = track.edited[i + 1];
        //     track.hovered[i] = track.hovered[i + 1];
        //     track.selected[i] = track.selected[i + 1];
        // }

        // Update animation action interpolation info
        if(this.onDeleteKeyFrame)
            this.onDeleteKeyFrame( trackIdx, index );
        
        return true;
    }
    
    /** Delete one or more keyframes given the triggered event
     * @e: event
     * @track:
     * @index: index of the keyframe on the track
    */
    deleteKeyFrame(e, track, index) {
        
        if(e.multipleSelection) {

            // Split in tracks
            const perTrack = [];
            this.lastKeyFramesSelected.forEach( e => perTrack[e[1]] ? perTrack[e[1]].push(e) : perTrack[e[1]] = [e] );
            
            for(let pts of perTrack) {
                
                if(!pts) continue;

                pts = pts.sort( (a,b) => b[2] - a[2] ); // sort by keyframe index (descending)

                // Delete every selected key starting with the last one in the track
                for(let [name, localIdx, keyIndex] of pts) {
                    let track = this.tracksPerItem[name][localIdx];
                    this.saveState(track.clipIdx); 
                    this.#delete(track.clipIdx, keyIndex);
                }
            }
        }
        else{

            // Key pressed
            if(!track && this.lastKeyFramesSelected.length > 0) {
                const [itemName, localTrackIndex, keyIndex] = this.lastKeyFramesSelected[0];
                track = this.tracksPerItem[itemName][localTrackIndex];
                index = keyIndex;
            }

            if ( track ){
                this.saveState(track.clipIdx);
                this.#delete(track.clipIdx, index);
            }
        }

        this.unSelectAllKeyFrames();
    }

    getNumKeyFramesSelected() {
        return this.lastKeyFramesSelected.length;
    }

    unSelect() {

        if(!this.unSelectAllKeyFrames()) {
            this.selectedItems = null;
            if(this.onItemUnselected)
                this.onItemUnselected();
        }
    }

    /**
     * @param {Array} itemsName 
     */
    setSelectedItems( itemsName ) {

        if(itemsName.constructor !== Array)
        throw("Item name has to be an array!");

        this.selectedItems = itemsName;
        this.unSelectAllKeyFrames();
        this.updateLeftPanel();
    }

    getTrack( trackInfo )  {
        const [name, trackIndex] = trackInfo;
        return this.tracksPerItem[ name ][trackIndex];
    }

    getTrackName( uglyName ) {

        let name, type;

        // Support other versions
        if(uglyName.includes("[")) {
            const nameIndex = uglyName.indexOf('['),
                trackNameInfo = uglyName.substr(nameIndex+1).split("].");
            name = trackNameInfo[0].replaceAll(/[\[\]]/g,"");
            name = name.replaceAll("_", " ");
            type = trackNameInfo[1];
        }else {
            const trackNameInfo = uglyName.split(".");
            name = trackNameInfo[0].replaceAll(/[\[\]]/g,"");
            name = name.replaceAll("_", " ");
            type = trackNameInfo[1];
        }

        return [name, type];
    }

    /**
     * Binary search. Relies on track.times being a sorted array
     * @param {object} track 
     * @param {number} time 
     * @param {number} mode on of the possible values 
     *  - -1 = nearest frame with t[f] <= time 
     *  - 0 = nearest frame 
     *  - 1 = nearest frame with t[f] >= time
     * @returns a zero/positive value if successful. On failure returnes -1 meaning either there are no frames (0), no frame-time is lower (-1) or no frame-time is higher (1)
     */
    getNearestKeyFrame( track, time, mode = 0 ) {

        if(!track || !track.times || !track.times.length)
            return -1;

        //binary search
        const times = track.times;
        let min = 0, max = times.length - 1;
        
        // edge cases
        if ( times[min] > time ){
            return mode == -1 ? -1 : 0;
        }
        if ( times[max] < time ){
            return mode == 1 ? -1 : max;
        }
        
        // time is between first and last frame
        let half = Math.floor( ( min + max ) / 2 );
        while ( min < half && half < max ){
            if ( time < times[half] ){ max = half; }
            else{ min = half; }
            half = Math.floor( ( min + max ) / 2 );
        }

        if (mode == 0 ){
            return Math.abs( time - times[min] ) < Math.abs( time - times[max] ) ? min : max;
        }
        else if ( mode == -1 ){
            return times[max] == time ? max : min;
        }
        return times[min] == time ? min : max;
    }

    /**
     * get the nearest keyframe to "time" given a maximum threshold. 
     * @param {object} track 
     * @param {number} time 
     * @param {number} threshold must be positive value
     * @returns returns a postive/zero value if there is a frame inside the threshold range. Otherwise, -1
     */
    getCurrentKeyFrame( track, time, threshold = 0.0 ) {

        if(!track || !track.times.length)
            return -1;

        let frame = this.getNearestKeyFrame( track, time );
        if ( frame > -1 ){
            frame = Math.abs(track.times[frame] - time) > threshold ? -1 : frame;
        }

        return frame;
    }

    /**
     * Returns the interval of frames between minTime and maxTime (both included)
     * @param {object} track 
     * @param {number} minTime 
     * @param {number} maxTime 
     * @param {number} threshold must be positive value 
     * @returns an array with two values [ minFrame, maxFrame ]. Otherwise null 
     */
    getKeyFramesInRange( track, minTime, maxTime, threshold = 0.0 ) {

        if(!track || !track.times.length)
            return null;

        // Manage negative selection
        if(minTime > maxTime) {
            let aux = minTime;
            minTime = maxTime;
            maxTime = aux;
        }

        const minFrame = this.getNearestKeyFrame( track, minTime - threshold, 1 );
        const maxFrame = this.getNearestKeyFrame( track, maxTime + threshold, -1 );

        if ( maxFrame == -1 || minFrame == -1 ){ return null; }

        return [minFrame, maxFrame];
    }

    unHoverAll() {
        if(this.lastHovered) {
            this.tracksPerItem[ this.lastHovered[0] ][ this.lastHovered[1] ].hovered[ this.lastHovered[2] ] = false;
        }
        let h = this.lastHovered;
        this.lastHovered = null;
        return h;
    }

    unSelectAllKeyFrames() {

        for(let [name, idx, keyIndex] of this.lastKeyFramesSelected) {
            this.tracksPerItem[name][idx].selected[keyIndex] = false;
        }

        // Something has been unselected
        const unselected = this.lastKeyFramesSelected.length > 0;
        this.lastKeyFramesSelected.length = 0;
        return unselected;
    }

    processCurrentKeyFrame( e, keyFrameIndex, track, localX, multiple ) {

        if(track.locked)
            return;
    
        e.multipleSelection = multiple;
        if(!multiple && e.button != 2) {
            this.unSelectAllKeyFrames();
        }
        
        keyFrameIndex = keyFrameIndex ?? this.getCurrentKeyFrame( track, this.xToTime( localX ), this.pixelsToSeconds * 5 );
        if (keyFrameIndex < 0)
            return;
                        
        const name = this.tracksDictionary[track.fullname];
        const t = this.tracksPerItem[ name ][track.idx];
        
        this.selectKeyFrame(t, keyFrameIndex, !multiple, multiple); // changes time on the first keyframe selected
        const currentSelection = this.lastKeyFramesSelected[ this.lastKeyFramesSelected.length - 1 ];
       
        if( this.onSelectKeyFrame && this.onSelectKeyFrame(e, currentSelection)) {
            // Event handled
            return;
        }

        if (!multiple){
            this.currentTime = this.animationClip.tracks[t.clipIdx].times[ keyFrameIndex ];
            LX.emit( "@on_current_time_" + this.constructor.name, this.currentTime );
        }
    }

    /**
     * @method addNewTrack
     */

    addNewTrack() {

        if(!this.animationClip)
            this.animationClip = {tracks:[]};

        let trackInfo = {
            idx: this.animationClip.tracks.length,
            values: [], times: [],
            selected: [], edited: [], hovered: []
        };

        this.animationClip.tracks.push(trackInfo);
        this.updateLeftPanel();
        return trackInfo.idx;
    }

    /**
    * @method clearTrack
    */
    clearTrack(idx, defaultValue) {

        let track =  this.animationClip.tracks[idx];

        if(track.locked )
        {
            return;
        }

        const count = track.times.length;
        for(let i = count - 1; i >= 0; i--)
        {
            this.saveState(track.clipIdx);
            this.#delete(track, i );
        } 
        if(defaultValue != undefined) {
            if(typeof(defaultValue) == 'number')  {
                track.values[0] = defaultValue;
            }
            else {
                for(let i = 0; i < defaultValue.length; i++) {
                    track.values[i] = defaultValue[i];
                }
            }

        }
        return idx;
    }
}

LX.CurvesTimeline = CurvesTimeline;

/**
 * Draws a rounded rectangle using the current state of the canvas.
 * If you omit the last three params, it will draw a rectangle
 * outline with a 5 pixel border radius
 * @param {Number} x The top left x coordinate
 * @param {Number} y The top left y coordinate
 * @param {Number} width The width of the rectangle
 * @param {Number} height The height of the rectangle
 * @param {Number} [radius = 5] The corner radius; It can also be an object 
 *                 to specify different radii for corners
 * @param {Number} [radius.tl = 0] Top left
 * @param {Number} [radius.tr = 0] Top right
 * @param {Number} [radius.br = 0] Bottom right
 * @param {Number} [radius.bl = 0] Bottom left
 * @param {Boolean} [fill = false] Whether to fill the rectangle.
 * @param {Boolean} [stroke = true] Whether to stroke the rectangle.
 */

CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius = 5, fill = false, stroke = false) {
    
    if (typeof radius === 'number') {
        radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
        var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
        for (var side in defaultRadius) {
            radius[side] = radius[side] || defaultRadius[side];
        }
    }
    
    this.beginPath();
    this.moveTo(x + radius.tl, y);
    this.lineTo(x + width - radius.tr, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    this.lineTo(x + width, y + height - radius.br);
    this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    this.lineTo(x + radius.bl, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    this.lineTo(x, y + radius.tl);
    this.quadraticCurveTo(x, y, x + radius.tl, y);
    this.closePath();
    
    if (fill) {
        this.fill();
    }
    if (stroke) {
     this.stroke();
    }
}

LX.UTILS.HexToRgb = (hex) => {
    var c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255];
    }
    throw new Error('Bad Hex');
}

LX.UTILS.concatTypedArray = (arrays, ArrayType) => {
    let size = arrays.reduce((acc,arr) => acc + arr.length, 0);
    let result = new ArrayType( size ); // generate just one array
    let offset = 0;
    for( let i = 0; i < arrays.length; ++i ){
        result.set(arrays[i], offset ); // copy values
        offset += arrays[i].length;
    }
    return result;
}

export { Timeline, KeyFramesTimeline, ClipsTimeline, CurvesTimeline };