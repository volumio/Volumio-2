#!/bin/bash


doc() {
echo "
Usage : volumio <argument1> <argument2>

[[PLAYBACK STATUS]]

status                             Gives Playback status information
volume                             Gives Current Volume Information
volume <desired volume>            Sets Volume at desired level 0-100
volume mute                        Mutes
volume unmute                      Unmutes
volume plus                        Increases Volume of one step
volume minus                       Decreases Volume of one step
seek plus                          Forwards 10 seconds in the song
seek minus                         Backwards 10 seconds in the song
seek <seconds>                     Plays song from selected time
repeat                             Toggles repetition of queue
random                             Toggles randomization of queue


[[PLAYBACK CONTROL]]

play
pause
next
previous
stop
clear


[[VOLUMIO SERVICE CONTROL]]

start                               Starts Volumio Service
vstop                               Stops Volumio Service
restart                             Restarts Volumio Service

[[VOLUMIO DEVELOPMENT]]

pull                               Pulls latest github status on master
kernelsource                       Gets Current Kernel source (Raspberry PI only)
plugin init                        Creates a new plugin
plugin refresh                     updates plugin in the system
plugin package                     compresses the plugin
plugin publish                     publishes the plugin on git
"

}

#VOLUMIO SERVICE CONTROLS

start() {
echo volumio | sudo -S systemctl start volumio.service
}

vstop() {
echo volumio | sudo -S systemctl stop volumio.service
}

#VOLUMIO DEVELOPMENT

pull() {
echo "Stopping Volumio"
echo volumio | sudo -S systemctl stop volumio.service
echo volumio | sudo -S sh /volumio/app/plugins/system_controller/volumio_command_line_client/commands/pull.sh
echo "Pull completed, restarting Volumio"
echo volumio | sudo -S systemctl start volumio.service
echo "Done"
}

kernelsource() {
echo volumio | sudo -S sh /volumio/app/plugins/system_controller/volumio_command_line_client/commands/kernelsource.sh
}

case "$1" in
        play)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=play"
            ;;
        toggle)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=toggle"
            ;;
        pause)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=pause"
            ;;
        next)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=next"
            ;;
        previous)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=prev"
            ;;
        stop)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=stop"
            ;;
        clear)
            /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=clearQueue"
            ;;
        seek)
            if [ "$2" != "" ]; then
                /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=seek&position=$2"
            else
               /usr/bin/curl -sS "http://127.0.0.1:3000/api/v1/getstate" | /usr/bin/jq -r '.seek'
            fi
            ;;
        repeat)
            if [ "$2" != "" ]; then
                /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=repeat&value=$2"
            else
               /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=repeat"
            fi
            ;;
        random)
            if [ "$2" != "" ]; then
                /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=random&value=$2"
            else
               /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=random"
            fi
            ;;
        startairplay)
           /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=startAirplay"
        ;;
        stopairplay)
           /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=stopAirplay"
        ;;
        start)
            start
            ;;
        start)
            start
            ;;

        vstop)
            stop
            ;;

        restart)
            stop
            start
            ;;

        status)
            /usr/bin/curl -sS "http://127.0.0.1:3000/api/v1/getstate" | /usr/bin/jq -r '.'
            ;;
        volume)
            if [ "$2" != "" ]; then
               /usr/bin/curl "http://127.0.0.1:3000/api/v1/commands/?cmd=volume&volume=$2"
            else
               /usr/bin/curl -sS "http://127.0.0.1:3000/api/v1/getstate" | /usr/bin/jq -r '.volume'
            fi
            ;;
	    pull)
            pull
            ;;
	    kernelsource)
	        kernelsource
            ;;
        plugin)
            if [ "$2" != "" ]; then
                if [ "$2" == "init" ]; then
                    echo ""
                    echo "Welcome to the Volumio Plugin Creator!"
                    echo "You have to decide which category your plugin belongs to, \
then you have to select a name for it, leave us the rest ;)"
                    echo "Warning: make meaningful choices, you cannot change them later!"
                    echo ""
                elif [ "$2" == "refresh" ]; then
                    echo ""
                    echo "This command will copy all your plugin's file in the \
correspondent folder in data"
                    echo ""
                elif [ "$2" == "package" ]; then
                    echo ""
                    echo "This command will create a package with your plugin"
                    echo ""
                elif [ "$2" == "publish" ]; then
                    echo ""
                    echo "This command will publish the plugin on volumio plugins store"
                    echo ""
                fi
               /usr/local/bin/node /volumio/pluginhelper.js $2
            else
                echo ""
                echo "---- VOLUMIO PLUGIN HELPER ----"
                echo ""
                echo "This utility helps you creating new plugins for Volumio."
                echo "Options:"
                echo "init      creates a new plugin"
                echo "refresh   copies the plugin in the system"
                echo "package   compresses the plugin"
                echo "publish   publishes the plugin on git"
                echo ""
            fi
            ;;
        *)
            doc
            exit 1

esac




