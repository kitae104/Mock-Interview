"""브라우저가 보내는 비언어 요약 지표(docs/PLAN.md 5장)의 검증. 영상·프레임별 좌표는 받지 않고 이 숫자 요약만 받습니다.

값의 범위가 이상하면 400 으로 거절합니다 (화면의 분석 코드가 만드는 값은 항상 이 범위 안입니다).
판정(좋음/보통/주의)과 점수 반영은 6단계에서 이 값으로 합니다.
"""

from typing import Annotated

from pydantic import Field

from app.common.schemas import ApiModel
from app.interviews.thresholds import NONVERBAL_MIN_COVERAGE, NONVERBAL_MIN_FACE_RATIO, NONVERBAL_MIN_SECONDS

Ratio = Annotated[float, Field(ge=0, le=1)]


class NonverbalMetrics(ApiModel):
    version: Annotated[int, Field(ge=1, le=1000)]
    analysis_seconds: Annotated[float, Field(ge=0, le=3600)]
    sample_coverage: Ratio
    face_frames: Annotated[int, Field(ge=0, le=100_000)]
    pose_frames: Annotated[int, Field(ge=0, le=100_000)]

    face_visible_ratio: Ratio
    gaze_at_camera_ratio: Ratio | None = None
    head_motion_deg_per_sec: Annotated[float, Field(ge=0, le=100_000)] | None = None
    shoulder_tilt_deg: Annotated[float, Field(ge=0, le=180)] | None = None
    posture_collapse_ratio: Ratio | None = None
    smile_ratio: Ratio | None = None
    blinks_per_minute: Annotated[float, Field(ge=0, le=300)] | None = None
    gestures_per_minute: Annotated[float, Field(ge=0, le=300)] | None = None
    hand_motion_index: Annotated[float, Field(ge=0, le=1000)] | None = None
    hands_visible_ratio: Ratio | None = None

    #: 이 값을 잴 때 브라우저가 쓴 임계값 (기록용)
    client_thresholds: Annotated[dict[str, float], Field(max_length=40)] = Field(default_factory=dict)

    def is_reliable(self) -> bool:
        """얼굴이 충분히 보였고 충분한 시간·횟수로 분석했을 때만 참고합니다 (PLAN 5.2). 아니면 점수에서 제외합니다."""
        return (
            self.face_visible_ratio >= NONVERBAL_MIN_FACE_RATIO
            and self.analysis_seconds >= NONVERBAL_MIN_SECONDS
            and self.sample_coverage >= NONVERBAL_MIN_COVERAGE
        )


class BaselineModel(ApiModel):
    """점검 화면에서 잰 기준 자세 (docs/PLAN.md 5.2). 면접을 시작할 때 서버에 기록해 두고, 값의 범위만 검증합니다."""

    yaw_deg: Annotated[float, Field(ge=-180, le=180)]
    pitch_deg: Annotated[float, Field(ge=-180, le=180)]
    eye_h: Annotated[float, Field(ge=-2, le=2)]
    eye_v: Annotated[float, Field(ge=-2, le=2)]
    smile: Ratio
    #: 어깨가 보이지 않았으면 false 이고, 아래 어깨 값은 null
    pose_available: bool
    shoulder_tilt_deg: Annotated[float, Field(ge=-90, le=90)] | None = None
    shoulder_width: Annotated[float, Field(ge=0, le=10)] | None = None
    shoulder_mid_y: Annotated[float, Field(ge=-1, le=2)] | None = None
    neck_ratio: Annotated[float, Field(ge=-10, le=10)] | None = None
