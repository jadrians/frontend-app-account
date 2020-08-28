import React from 'react';
import PropTypes from 'prop-types';
import * as blazeface from '@tensorflow-models/blazeface';
import CameraPhoto, { FACING_MODES } from 'jslib-html5-camera-photo';
import { injectIntl, intlShape } from '@edx/frontend-platform/i18n';
import { Form, Spinner } from '@edx/paragon';

import shutter from './data/camera-shutter.base64.json';
import messages from './IdVerification.messages';

class Camera extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.cameraPhoto = null;
    this.videoRef = React.createRef();
    this.canvasRef = React.createRef();
    this.setDetection = this.setDetection.bind(this);
    this.state = {
      dataUri: '',
      videoHasLoaded: false,
      shouldDetect: false,
      isFinishedLoadingDetection: true,
    };
  }

  componentDidMount() {
    this.cameraPhoto = new CameraPhoto(this.videoRef.current);
    this.cameraPhoto.startCamera(FACING_MODES.USER, { width: 1280 });
  }

  async componentWillUnmount() {
    this.cameraPhoto.stopCamera();
  }

  setDetection() {
    this.setState(
      { shouldDetect: !this.state.shouldDetect },
      () => {
        if (this.state.shouldDetect) {
          this.setState({ isFinishedLoadingDetection: false });
          this.startDetection();
        }
      },
    );
  }

  startDetection() {
    setTimeout(() => {
      if (this.state.videoHasLoaded) {
        const loadModelPromise = blazeface.load();
        Promise.all([loadModelPromise])
          .then((values) => {
            this.setState({ isFinishedLoadingDetection: true });
            this.detectFromVideoFrame(values[0], this.videoRef.current);
          });
      } else {
        this.setState({ isFinishedLoadingDetection: true });
        this.setState({ shouldDetect: false });
        // TODO: add error message
      }
    }, 1000);
  }

  detectFromVideoFrame = (model, video) => {
    model.estimateFaces(video).then((predictions) => {
      if (this.state.shouldDetect && !this.state.dataUri) {
        this.showDetections(predictions);

        requestAnimationFrame(() => {
          this.detectFromVideoFrame(model, video);
        });
      }
    });
  };

  showDetections = (predictions) => {
    let canvasContext;
    if (predictions.length > 0) {
      canvasContext = this.canvasRef.current.getContext('2d');
      canvasContext.clearRect(0, 0, canvasContext.canvas.width, canvasContext.canvas.height);
    }
    // predictions is an array of objects describing each detected face
    predictions.forEach((prediction) => {
      const xAdjustment = 70;
      const yAdjustment = 55;
      const start = [prediction.topLeft[0] - xAdjustment, prediction.topLeft[1] - yAdjustment];
      const end = [prediction.bottomRight[0] - xAdjustment, prediction.bottomRight[1] - yAdjustment];
      const size = [end[0] - start[0], end[1] - start[1]];

      // landmarks is an array of points representing each facial landmark (i.e. right eye, left eye, nose, etc.)
      const features = prediction.landmarks;
      let isInPosition = true;

      // for each of the landmarks, determine if it is in position
      for (let j = 0; j < features.length; j++) {
        const x = features[j][0] - xAdjustment;
        const y = features[j][1] - yAdjustment;

        if (this.props.isPortrait) {
          isInPosition = isInPosition && this.isInRangeForPortrait(x, y);
        } else {
          isInPosition = isInPosition && this.isInRangeForID(x, y);
        }
      }

      // draw a box depending on if all landmarks are in position
      if (isInPosition) {
        canvasContext.strokeStyle = '#00ffff';
        canvasContext.lineWidth = 6;
        canvasContext.strokeRect(start[0], start[1], size[0], size[1]);
      } else {
        canvasContext.fillStyle = 'rgba(255, 51, 0, 0.75)';
        canvasContext.fillRect(start[0], start[1], size[0], size[1]);
      }
    });
  }

  isInRangeForPortrait(x, y) {
    return x > 40 && x < 480 && y > 60 && y < 330;
  }

  isInRangeForID(x, y) {
    return x > 60 && x < 360 && y > 150 && y < 250;
  }

  setVideoHasLoaded() {
    this.setState({ videoHasLoaded: 'true' });
  }

  takePhoto() {
    if (this.state.dataUri) {
      return this.reset();
    }
    const config = {
      sizeFactor: 1,
    };

    this.playShutterClick();
    const dataUri = this.cameraPhoto.getDataUri(config);
    this.setState({ dataUri });
    this.props.onImageCapture(dataUri);
  }

  playShutterClick() {
    const audio = new Audio(`data:audio/mp3;base64,${shutter.base64}`);
    audio.play();
  }

  reset() {
    this.setState({ dataUri: '' });
    if (this.state.shouldDetect) {
      this.startDetection();
    }
  }

  render() {
    const cameraFlashClass = this.state.dataUri
      ? 'do-transition camera-flash'
      : 'camera-flash';
    return (
      <div className="camera-outer-wrapper shadow">
        <Form.Group style={{ textAlign: 'left', padding: '0.5rem', marginBottom: '0.5rem' }} >
          <Form.Check
            id="videoDetection"
            name="videoDetection"
            label={this.props.intl.formatMessage(messages['id.verification.photo.enable.detection'])}
            aria-describedby="videoDetectionHelpText"
            checked={this.state.shouldDetect}
            onChange={this.setDetection}
            style={{ padding: '0rem', marginLeft: '1.25rem', float: this.state.isFinishedLoadingDetection ? 'none' : 'left' }}
          />
          {!this.state.isFinishedLoadingDetection && <Spinner animation="border" variant="primary" style={{ marginLeft: '0.5rem' }} data-testid="spinner" />}
          <Form.Text id="videoDetectionHelpText" data-testid="videoDetectionHelpText">
            {this.props.isPortrait
              ? this.props.intl.formatMessage(messages['id.verification.photo.enable.detection.portrait.help.text'])
              : this.props.intl.formatMessage(messages['id.verification.photo.enable.detection.id.help.text'])}
          </Form.Text>
        </Form.Group>
        <div className="camera-wrapper">
          <div className={cameraFlashClass} />
          <video
            ref={this.videoRef}
            data-testid="video"
            autoPlay
            className="camera-video"
            onLoadedData={() => { this.setVideoHasLoaded(); }}
            style={{ display: this.state.dataUri ? 'none' : 'block' }}
          />
          <canvas ref={this.canvasRef} data-testid="detection-canvas" className="canvas-video" style={{ display: !this.state.shouldDetect || this.state.dataUri ? 'none' : 'block' }} height="375" width="500" />
          <img
            alt="imgCamera"
            src={this.state.dataUri}
            className="camera-video"
            style={{ display: this.state.dataUri ? 'block' : 'none' }}
          />
        </div>
        <button
          className={`btn camera-btn ${
            this.state.dataUri ?
              'btn-outline-primary'
              : 'btn-primary'
          }`}
          accessKey="c"
          onClick={() => {
            this.takePhoto();
          }}
        >
          {this.state.dataUri
            ? this.props.intl.formatMessage(messages['id.verification.photo.retake'])
            : this.props.intl.formatMessage(messages['id.verification.photo.take'])}
        </button>
      </div>
    );
  }
}

Camera.propTypes = {
  intl: intlShape.isRequired,
  onImageCapture: PropTypes.func.isRequired,
  isPortrait: PropTypes.bool.isRequired,
};

export default injectIntl(Camera);
