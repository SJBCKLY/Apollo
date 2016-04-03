//Initialize the Spotify Web Api.
var spotifyApi = new SpotifyWebApi();

//These values control the parameters at which we group the peaks, adjusting these will allow for a different range of values.
//To be noted they are set by default to values which I have tested across a variety of samples.
var peaks,
    initialThresold = 0.9,
    thresold = initialThresold,
    minThresold = 0.3,
    minPeaks = 30;

//Inputs to handle the HTML side.
//These will be deleted soon once a working game example has been created.
//To be replaced by JavaScript text to fit onto a canvas.
var queryInput = document.querySelector('#query'),
    result = document.querySelector('#result'),
    text = document.querySelector('#text'),
    audioTag = document.querySelector('#audio');

document.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    result.style.display = 'none';
    //Search spotify for a corresponding track.
    spotifyApi.searchTracks(queryInput.value.trim(), { limit: 1 }).then(function (results) {
        //create a variable to store information about the selected track.
        var track = results.tracks.items[0];
        var previewUrl = track.preview_url;
        //Set the chosen track to the audioTag for playback once the BPM has been declared.
        audioTag.src = track.preview_url;
        var context = new (window.AudioContext || window.webkitAudioContext)();
        var request = new XMLHttpRequest();
        request.open('GET', previewUrl, true);
        request.responseType = 'arraybuffer';
        request.onload = function () {
            //Here we create an offline context for our song so we can play it back multiple times but only download it once.
            var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            var offlineContext = new OfflineContext(1, 2, 44100);
            offlineContext.decodeAudioData(request.response, function (buffer) {
                //Create a buffer source
                var audioSource = offlineContext.createBufferSource();
                audioSource.buffer = buffer;
                //Create and apply a filter to our track.
                //This filter is a 'Low-pass' filter.
                //We use this to lower the range of sounds heard as it is typical for the lower range sounds to keep the beat in time.
                //For example a bass guitar or a kick drum.
                var audioFilter = offlineContext.createBiquadFilter();
                audioFilter.type = "lowpass";
                audioSource.connect(audioFilter);
                audioFilter.connect(offlineContext.destination);
                //Reset the track to start playing from the beginning (0).
                audioSource.start(0);
                //Using the predefined function for counting peaks we begin to collect data from our track.
                //Starting with finding the peaks across a threshold.
                do {
                    peaks = findPeaksAtThreshold(buffer.getChannelData(0), thresold);
                    thresold -= 0.05;
                } while (peaks.length < minPeaks && thresold >= minThresold);
                //The next step is to group each guess for tempo we have so we can select an average between them all.
                var peakIntervals = countRefinedPeaks(peaks);
                //To further decrease the range of samples we then group our peaks by our target tempo.
                //This eliminates any odd guesses that have been caused by an irregular beat.
                var peakGroups = groupNeighborsByTempo(peakIntervals, buffer.sampleRate);
                //Finally we sort our peaks into groups to determine which has the most correct samples.
                var top = peakGroups.sort(function (intA, intB) {
                    return intB.count - intA.count;
                }).splice(0, 5);

                //Now we have the data we need we can display it to the user, or use it in a game.
                //To call the track name use "track.name"
                //To call the Artist name use "track.artists[0].name"
                //To call the BPM use "Math.round(top[0].tempo)"

                //This displays the information in HTML text.
                //This will be removed once the game prototype is underway.
                text.innerHTML = track.name + " by " + track.artists[0].name + " is " + Math.round(top[0].tempo) + ' BPM';
                //Play the song they have chosen to guess for.
                audioTag.play();
                //Display the results in HTML, this will also be removed.
                result.style.display = 'block';
            });
        };
        request.send();
    });
});

//This Function finds the peaks of the song above our set threshold.
//This should find us a uniform set of peaks, from which we can calculate the BPM.
function findPeaksAtThreshold(data, threshold) {
    var peaksCount = [];
    var length = data.length;
    for (var i = 0; i < length;) {
        if (data[i] > threshold) {
            peaksCount.push(i);
            //Here we skip forward approximatly one quater of a second forward to reach the next peak.
            i += 10000;
        }
        i++;
    }
    return peaksCount;
}

//This function groups our peaks.
//This gives us a clear interpretation of an emerging average.
function countRefinedPeaks(peaks) {
    var intervalCounts = [];
    peaks.forEach(function (peak, index) {
        for (var i = 0; i < 10; i++) {
            var interval = peaks[index + i] - peak;
            var foundInterval = intervalCounts.some(function (intervalCount) {
                if (intervalCount.interval === interval)
                    return intervalCount.count++;
            });
            if (!foundInterval) {
                intervalCounts.push({
                    interval: interval,
                    count: 1
                });
            }
        }
    });
    return intervalCounts;
}

//This function elimates tempo guesses from outside our range.
//These are usually caused by irregular drum patterns and by manipulating them we can find a clearer average.
function groupNeighborsByTempo(intervalCounts, sampleRate) {
    var tempoCounts = [];
    intervalCounts.forEach(function (intervalCount, i) {
        if (intervalCount.interval !== 0) {
            var theoreticalTempo = 60 / (intervalCount.interval / sampleRate);
            while (theoreticalTempo < 90) theoreticalTempo *= 2;
            while (theoreticalTempo > 180) theoreticalTempo /= 2;
            theoreticalTempo = Math.round(theoreticalTempo);
            var foundTempo = tempoCounts.some(function (tempoCount) {
                if (tempoCount.tempo === theoreticalTempo)
                    return tempoCount.count += intervalCount.count;
            });
            if (!foundTempo) {
                tempoCounts.push({
                    tempo: theoreticalTempo,
                    count: intervalCount.count
                });
            }
        }
    });
    return tempoCounts;
}