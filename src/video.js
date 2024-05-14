const VideoUtils = {

    startTime: 0,
    endTime: null,
    markerHeight: 25,
    offsetWidth: 20,
    offsetHeight: 5,
    playButtonWidth: 40,
    onSetTime: null,
    onRender: null,

    bind: async function(video, canvas, callback) {

        canvas.addEventListener("mouseup", this.onMouse.bind(this));
        canvas.addEventListener("mousedown", this.onMouse.bind(this));
        canvas.addEventListener("mousemove", this.onMouse.bind(this));
        canvas.addEventListener("mouseleave", this.onMouse.bind(this));
        
        document.body.onkeydown = this.onKey.bind(this);

        video.onended = this.onVideoEnded.bind(this);
        video.loop = false; // Control loops manually

        this.video = video;
        this.width = canvas.width;
        this.height = canvas.height;
        this.ctx = canvas.getContext('2d');

        // Hacky fix: Duration is infinity if not setting a time..
        // MediaElement bug
        while(video.duration === Infinity || isNaN(video.duration)) {
            await new Promise(r => setTimeout(r, 1000));
            video.currentTime = 10000000 * Math.random();
        }

        this.ratio = (video.duration/(this.width - this.offsetWidth*2 - this.playButtonWidth)) * 15;
        this.startTime = video.currentTime = 0;
        this.endTime = video.duration;    
        this.render();
        
        window.VU = this;

        this.animate();
        
        if ( callback ){ callback(); }
    },

    onVideoEnded: function() {

        this.video.currentTime = this.startTime;
        this.video.play();
    },

    animate: async function() {
        
        if(!this.video)
        return;

        while(this.video.duration === Infinity || isNaN(this.video.duration)) {
            await new Promise(r => setTimeout(r, 1000));
            this.video.currentTime = 10000000 * Math.random();
        }
        if(this.endTime > this.video.duration) 
        {
            this.endTime =this.video.duration;
            this.ratio = (this.video.duration/(this.width - this.offsetWidth*2 - this.playButtonWidth)) * 15;
        }

        requestAnimationFrame(this.animate.bind(this));
        this.update();
        this.render();
    },

    update: function() {

        if(this.video.paused)
        return;

        if(this.video.currentTime >= this.endTime)
            this.video.currentTime = this.startTime;
            
        if(this.onSetTime)
            this.onSetTime(this.video.currentTime);
    },

    render: function() {

        // It needs a video bound
        if(!this.video)
        return;

        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(0, 0, this.width, this.height);

        if ( this.onRender ){
            this.onRender();
        }

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "rgb(29, 29, 29)";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.roundRect(this.offsetHeight, this.height - this.markerHeight - this.offsetHeight*3, this.width - this.offsetHeight*2, this.markerHeight + this.offsetHeight*2);
        ctx.fill();

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#444";
        ctx.fillRect(this.playButtonWidth + this.offsetWidth, this.height - 0.5*(this.markerHeight + this.offsetHeight*3) - 1  , this.width - this.offsetWidth*2 - this.playButtonWidth, 2);

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#5f88c9';
        ctx.fillRect(this.playButtonWidth + this.offsetWidth + this.timeToX(this.startTime), this.height - 0.5*(this.markerHeight + this.offsetHeight*3) - 1 , this.timeToX(this.endTime - this.startTime), 2);
        
        ctx.strokeStyle = ctx.fillStyle;
        this.renderPlayButton();

        // Min-Max time markers
        this.renderTimeMarker('start', this.startTime, { color: null, fillColor: '#5f88c9', width: 15 });
        this.renderTimeMarker('end', this.endTime, { color: null, fillColor: '#5f88c9', width: 15 });
        this.renderTimeMarker('current', this.video.currentTime, { color: '#e5e5e5', fillColor: '#5f88c9', width: 2 });

        ctx.restore();
    },

    renderPlayButton: function() {
        const ctx = this.ctx;

        if(this.video.paused)
        {         
            //make play button
            ctx.beginPath();
            ctx.moveTo(this.offsetWidth + 2, this.height - this.markerHeight - this.offsetHeight*2 + 4);
            ctx.lineTo(this.offsetWidth + 2, this.height - this.offsetHeight*2 - 4);
            ctx.lineTo( this.playButtonWidth - 2, this.height - 0.5*(this.markerHeight + this.offsetHeight*2 ) -4);
            ctx.closePath();
            ctx.fill();

            // stroke the triangle path.
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.stroke();

            if(this.hovering == 'play')
            {
                ctx.globalAlpha = 0.2;
                ctx.beginPath();
                ctx.moveTo(this.offsetWidth - 0.5, this.height - this.markerHeight - this.offsetHeight*2 +3);
                ctx.lineTo(this.offsetWidth - 0.5, this.height - this.offsetHeight*2 -3);
                ctx.lineTo( this.playButtonWidth + 0.5 , this.height - 0.5*(this.markerHeight + this.offsetHeight*2 ) - 4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        } else{
            ctx.roundRect(this.offsetWidth, this.height - this.markerHeight - this.offsetHeight*2 + 4, (this.playButtonWidth - this.offsetWidth)*0.5 - 4, this.markerHeight - 8);
            ctx.fill();
            ctx.roundRect(this.offsetWidth + (this.playButtonWidth - this.offsetWidth)*0.5 , this.height - this.markerHeight - this.offsetHeight*2 + 4, (this.playButtonWidth - this.offsetWidth)*0.5 - 4, this.markerHeight - 8);
            ctx.fill();
            if(this.hovering == 'play')
            {
                ctx.globalAlpha = 0.2;
                ctx.roundRect(this.offsetWidth - 2, this.height - this.markerHeight - this.offsetHeight*2 + 2, (this.playButtonWidth - this.offsetWidth)*0.5, this.markerHeight - 4);
                ctx.fill();
                ctx.roundRect(this.offsetWidth + (this.playButtonWidth - this.offsetWidth)*0.5, this.height - this.markerHeight - this.offsetHeight*2 + 2, (this.playButtonWidth - this.offsetWidth)*0.5 - 4, this.markerHeight - 4);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    },

    renderTimeMarker: function(name, time, options) {

        options = options || {};
        const ctx = this.ctx;
        ctx.lineWitdh = 1;
        const x = this.offsetWidth + this.playButtonWidth + this.timeToX(time);
        let h0 = this.height - this.markerHeight - this.offsetHeight*2;
        let h = this.markerHeight ;

        let mWidth = options.width ? options.width : (this.dragging == name ? 6 : 4);
        let markerColor = options.color || options.fillColor;

        ctx.strokeStyle = markerColor;
        ctx.globalAlpha = 1;
        ctx.fillStyle = options.fillColor || '#111' // "#FFF";
        //ctx.fillRect( x - mWidth * 0.5, h0, mWidth, h0 + h);
        //ctx.beginPath();
        ctx.roundRect(x - mWidth * 0.5, h0, mWidth,  h);
        ctx.fill();
        if(this.hovering == name) {
            ctx.globalAlpha = 0.2;
            // ctx.fillRect( x - mWidth * 0.5 - 2, h0, mWidth + 2, h0 + h);
            //ctx.beginPath();
            ctx.roundRect( x - mWidth * 0.5 - 2, h0, mWidth + 4,  h);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        
        // Current time text
        if(name == 'current' ) {
            h0 -= this.offsetHeight + 4;
            ctx.globalAlpha = 1;
            // ctx.beginPath();
            // ctx.moveTo(x, h0);
            // ctx.lineTo(x, h0 + h);
            // ctx.stroke();

            ctx.fillStyle = options.fillColor || '#e5e5e5';
            ctx.beginPath();
            ctx.moveTo(x - 8, h0 - 1);
            ctx.lineTo(x + 8, h0 - 1);
            ctx.lineTo(x, h0 + 10);
            ctx.fill();

            // ctx.fillStyle = '#e5e5e5';
            // ctx.beginPath();
            // ctx.moveTo(x - 6, h0);
            // ctx.lineTo(x + 6, h0);
            // ctx.lineTo(x, h0 + 8);
            // ctx.fill();

            let xPos = Math.max( Math.min( x - 17, this.width - 42), 5 );
            ctx.fillStyle = "rgba(200, 200, 200, 0.2)";
            ctx.lineWitdh = 0;
            ctx.roundRect(xPos - 5, h0 - 25, 47, 15);
            ctx.fill();
            ctx.fillStyle = "#e5e5e5";
            ctx.font = "bold 16px Calibri";
            ctx.fillText(String(time.toFixed(3)), xPos, h0 - 12);
        }
        else {
            ctx.strokeStyle = 'rgb(200, 200, 200)'
            ctx.beginPath();
            ctx.lineWitdh = 2;
            ctx.moveTo(x, h0 + 4);
            ctx.lineTo(x, h0 + h - 4);
            ctx.stroke();
        }
        
    },

    onMouse: function(e)  {
        
        e.preventDefault();
        
        if(!this.ctx)
		return;

        // Process mouse
        var x = e.offsetX;
        var y = e.offsetY;

        if( e.type == "mouseup" || e.type == "mouseleave") {
            this.dragging = false;
            this.hovering = false;
        }
        else if( e.type == "mousedown") {

            if(x < this.playButtonWidth && x > this.offsetWidth)
            {
                this.video.paused ? this.video.play() : this.video.pause();
                return;
            }
            const t = this.xToTime(x - this.offsetWidth - this.playButtonWidth);

            if(Math.abs( this.startTime - t) < this.ratio) {
                this.dragging = 'start';
            } else if(Math.abs( this.endTime - t) < this.ratio) {
                this.dragging = 'end';
            } else if(Math.abs( this.video.currentTime - t) < this.ratio) {
                this.dragging = 'current';
            } else {
                this.video.currentTime = t;
                if(this.onSetTime)
                    this.onSetTime(t);
            }
        }
        else if( e.type == "mousemove") {

            const t = this.xToTime(x - this.offsetWidth - this.playButtonWidth);

            const hoverStart = t < (this.endTime - this.ratio * 2) && t >= 0.0;
            const hoverEnd = t > (this.startTime + this.ratio * 2);

            if(this.dragging) {
                switch(this.dragging) {
                    case 'start':
                        if(hoverStart)
                            this.startTime = t; 
                        break;
                    case 'end':
                        if(hoverEnd)
                            this.endTime = t; 
                        break;
                    case 'current':
                        this.video.currentTime = t; 
                        break;
                }

                this.video.currentTime = t;//Math.min( this.endTime, Math.max( this.startTime, this.video.currentTime ) );
                if(this.onSetTime)
                    this.onSetTime(t);
            }
            else {
                if(x < this.playButtonWidth && x > this.offsetWidth)
                    this.hovering = 'play';
                else if(Math.abs( this.startTime - t) < this.ratio)
                    this.hovering = 'start';
                else if(Math.abs( this.endTime - t) < this.ratio)
                    this.hovering = 'end';
                else if(Math.abs( this.video.currentTime - t) < this.ratio)
                    this.hovering = 'current';
                else 
                    this.hovering = false;
            }
        }
    },

    onKey: function(e) {

        if(e.type == "keydown") {
            if(e.key == ' ') {
                e.preventDefault();
                this.video.paused ? this.video.play() : this.video.pause();
            }
        }
    },

    xToTime: function(x) {
        return (x / (this.width - this.offsetWidth*2 - this.playButtonWidth)) *  this.video.duration;
    },

    timeToX: function (time) {
        return (time / this.video.duration) *  (this.width - this.offsetWidth*2 - this.playButtonWidth);
    },

    unbind: function(callback) {

        // Reset some stuff
        document.body.onkeydown = null;
        
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.video.startTime = this.startTime;
        this.video.onended = function() {
            this.currentTime = this.startTime;
            this.play();
        };
            
        // this.video.onended = null;
        // this.video.loop = true;
        this.video.pause();    
        this.video.currentTime = this.startTime;

        if(callback)
            callback( this.startTime, this.endTime );

        this.video = null;
        this.width = null;
        this.height = null;
        this.ctx = null;

        this.ratio = null;
        this.startTime = null;
        this.endTime = null;   
    },

    // This is a version for trimming the video using
    // MediaRecorder: the video is not synced with the original trim
    // so by now don't trim and play only the right slice of video
    unbindAndTrim: function(callback) {

        // Reset some stuff
        document.body.onkeydown = null;
        this.video.onended = null;

        let durationInMs = (this.endTime - this.startTime) * 1000;
        let chunks = [];
        let recorder = new MediaRecorder(this.video.captureStream(), { mimeType: 'video/webm;codecs=vp8' });

        recorder.ondataavailable = (e) => {
            if(chunks.length)
            return;
            console.log("Data available");
            chunks.push( e.data );
            recorder.stop();
        };

        recorder.onstop = (e) => {

            let blob = new Blob(chunks, { "type": 'video/webm;codecs=vp8' });
            const url = URL.createObjectURL( blob );
            this.video.src = url;

            let video = this.video;

            video.addEventListener('loadeddata', async () => {
                while(video.duration === Infinity) {
                    await new Promise(r => setTimeout(r, 1000));
                    video.currentTime = 10000000*Math.random();
                }

                console.log( "Trimmed duration: " + video.duration );

                this.video.loop = true;
                this.video.pause();    
                this.video.currentTime = 0;

                if(callback)
                    callback( this.startTime, this.endTime );

                this.video = null;
                this.width = null;
                this.height = null;
                this.ctx = null;

                this.ratio = null;
                this.startTime = null;
                this.endTime = null;   
            });
        };

        console.log("Original duration: " + durationInMs/1000);
        this.video.currentTime = this.startTime;
        recorder.start( durationInMs + 0.06 );
        this.video.play();
        this.trimming = true;
        this.recorder = recorder;
    }
}

export { VideoUtils };