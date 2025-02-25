FROM nginx:1.27.4

# set workdir of cmd inside the image
WORKDIR /usr/share/nginx/html

# copy local files into image ( copy path_local path_image ). Copy everything where dockerfile is into workdir
COPY . .

# expose ports that app will use if needed
EXPOSE 80