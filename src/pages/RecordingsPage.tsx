import React from 'react';

const RecordingsPage = () => {
    const recordings = [
        { id: 1, title: 'Recording 1', url: 'https://example.com/recording1.mp3' },
        { id: 2, title: 'Recording 2', url: 'https://example.com/recording2.mp3' },
        { id: 3, title: 'Recording 3', url: 'https://example.com/recording3.mp3' },
    ];

    return (
        <div>
            <h1>List of Recordings</h1>
            <ul>
                {recordings.map(recording => (
                    <li key={recording.id}>
                        <h2>{recording.title}</h2>
                        <audio controls>
                            <source src={recording.url} type="audio/mpeg" />
                            Your browser does not support the audio element.
                        </audio>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default RecordingsPage;