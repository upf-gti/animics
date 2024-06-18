# Animics

This web application estimates computer animations from a single-camera input video. It is hosted in this [link](https://https://webglstudio.org/projects/signon/animics/).

## Description

The first view of the application is a selector of the provided input. It supports pre-recorded videos or the video stream from the webcam. It can also load previously created animations for editing purposes.

<p align="center"> <img src="./docs/inputSelector.png" width="500"> </p>

Loading a video or capturing it live through the webcam redirects the user to the video editing stage. Here the resulting video can be trimmed if desired and/or redo the video by recording it again or uploading a new one. Once the user is fine with the result, the option "Convert Data to 3D Animation" moves the application to the last view.

The last station is a viewer and an editor of the final estimated animation. The application converts the video (2D) into a 3D animation through a diverse set of Machine Learning (ML) techniques. Since the output might not be perfect, the editor allows the user to edit/correct as desired the animation with the help of a timeline and a GUI to move the joints of the skeleton.

<p align="center"> <img src="./docs/editStation.png" width="800"> </p>


Finally, the user can download the animation as a BVH format file to use it in any other applications with different purposes.


## Editor GUI

### Top Bar

It contains (ordered from left to right):
- The SignON logo linked to the oficial project link
- The _Project_ button with some editing options
- The _Timeline_ button with some timeline editing options and shortcuts
- Play/Pause button
- Restart button

### Side panel
The panel on the right is divided into four sections. 
- The _Skeleton_ heriarchy shows the different bones and their relations. It provides also a quick way to find and select a specific bone by name
- _Animation Clip_ shows generic information about the animation like the name and duration of the animation. The playback speed can be adjusted through the "speed" slider.
- _Gizmo_ changes some settings of the rotation tool (the ball on the shoulder of the avatar ). The gear button offers some options such as making the yellow joint points biggers/smaller.
- _Bone_ offers the possibility of directly modifying the rotation values by writing them instead of using the in-scene tool

### Scene
The center of the screen shows the scene with the avatar in a pose, determined by the animation frames and the current time in the timeline.

Clicking on a bone (yellow point) selects that joint. The ball with several lines that appears allows the user to rotates that joint in different axes by just clicking and dragging in the desired axis.
The coloured axes are the typical perpendicular axes: red x-axis, green y-axis and blue z-axis. The outer circle rotates in the same plane as the camera is showing.

<p align="center"> <img src="./docs/rotationTool.png" width=""> </p>

The buttons in the right side (not in the side panel) shows/hides the skeleton (lines) and the joints points for a clearer view

To move the camera position of the scene either left-click and drag in it (not on a bone) to orbit or right-click and drag to move the camera sideways. Scrolling zooms in and out (up to certain limits).

### Timeline
The timeline located at the bottom of the screen, shows a point for each frame of the animation of the selected bone. Each bone has its own track. Dragging the the timeline moves the current selected time, thus changing the pose in which the avatar is. To modify a frame, a point in the timeline needs to be selected, which will change colour into yellow. When a rotation is performed through the gizmo, the dot will become purple.
Right clicking in the timeline allows to insert a new frame or deleting an existing one.
The timeline can be zoomed in and out.

<p align="center"> <img src="./docs/timelineEdit1.png" width=""> </p>


## Acknowledgements

This project makes use of the following libraries:
- [Three.js](https://github.com/mrdoob/three.js/) - An open-source JavaScript library for creating interactive 3D and 2D graphics in web browsers using WebGL.
- [Mediapipe](https://github.com/google/mediapipe) - An open-source library from Google for building cross-platform multimodal applied ML pipelines.
- [Tensorflow.js](https://github.com/tensorflow/tfjs) - A JavaScript library for training and deploying machine learning models in the browser and on Node.js.
- [Lexgui.js](https://github.com/jxarco/lexgui.js/) - A simple and lightweight GUI library for creating graphical user interfaces for web applications.

We would like to extend our gratitude to the creators and maintainers of these libraries for their invaluable contributions to the open-source community.


## Developers

- Víctor Ubieto [@victorubieto](https://github.com/victorubieto)
- Pablo García [@PZerua](https://github.com/PZerua)
- Eva Valls [@evallsg](https://github.com/evallsg)
- Alex Rodríguez [@jxarco](https://github.com/jxarco)
- Jaume Pozo [@japopra](https://github.com/japopra)  


## Support

This project is being developed with partial financial support of:

| EMERALD Project (2023-2026) | SignON Project (2021-2023) |
| --- | --- |
| ![miciu](./data/imgs/marco_EMERALD.png) | ![logomaxr](./data/imgs/marco_SignON.png) |
